import "https://deno.land/std@0.210.0/dotenv/load.ts";
import type { Trade } from "../types/types.ts";
import { MarketSimClient } from "../lib/marketSimClient.ts";
import { createProducer } from "../lib/messaging.ts";

const PORT = Number(Deno.env.get("TWAP_ALGO_PORT")) || 5_004;
const EMS_PORT = Number(Deno.env.get("EMS_PORT")) || 5_001;
const EMS_HOST = Deno.env.get("EMS_HOST") || "localhost";
const MARKET_SIM_PORT = Number(Deno.env.get("MARKET_SIM_PORT")) || 5_000;
const MARKET_SIM_HOST = Deno.env.get("MARKET_SIM_HOST") || "localhost";
const INTERVAL_MS = Number(Deno.env.get("TWAP_INTERVAL_MS")) || 5_000;

console.log(`TWAP Algo running on port ${PORT}, interval=${INTERVAL_MS}ms`);

const marketClient = new MarketSimClient(MARKET_SIM_HOST, MARKET_SIM_PORT);
marketClient.start();

const producer = await createProducer("twap-algo").catch((err) => {
  console.warn("[twap-algo] Redpanda unavailable:", err.message);
  return null;
});

interface TwapState {
  orderId: string;
  order: Trade;
  totalQty: number;
  filledQty: number;
  costBasis: number;
  numSlices: number;
  currentSlice: number;
}

async function sendSliceToEms(state: TwapState, qty: number, marketPrice: number): Promise<void> {
  const childId = `${state.orderId}-twap-${state.currentSlice}`;
  try {
    await producer?.send("orders.child", {
      childId,
      parentOrderId: state.orderId,
      algo: "TWAP",
      asset: state.order.asset,
      side: state.order.side,
      quantity: qty,
      limitPrice: state.order.limitPrice,
      marketPrice,
      sliceIndex: state.currentSlice,
      numSlices: state.numSlices,
      algoParams: { intervalMs: INTERVAL_MS, numSlices: state.numSlices },
      ts: Date.now(),
    }).catch(() => {});

    const res = await fetch(`http://${EMS_HOST}:${EMS_PORT}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset: state.order.asset,
        side: state.order.side,
        quantity: qty,
      }),
    });
    const result = await res.json();

    if (result.filledQty > 0) {
      state.filledQty += result.filledQty;
      state.costBasis += result.filledQty * result.avgFillPrice;
      const avgFill = state.costBasis / state.filledQty;
      const pct = ((state.filledQty / state.totalQty) * 100).toFixed(1);

      await producer?.send("orders.filled", {
        childId,
        parentOrderId: state.orderId,
        algo: "TWAP",
        asset: state.order.asset,
        side: state.order.side,
        filledQty: result.filledQty,
        avgFillPrice: result.avgFillPrice,
        marketImpactBps: result.marketImpactBps,
        totalFilled: state.filledQty,
        totalQty: state.totalQty,
        ts: Date.now(),
      }).catch(() => {});

      console.log(
        `📈 TWAP slice ${state.currentSlice}/${state.numSlices}: ` +
        `filled ${result.filledQty} @ ${result.avgFillPrice} | ` +
        `total ${state.filledQty}/${state.totalQty} (${pct}%) avgFill=${avgFill.toFixed(4)} ` +
        `impact=${result.marketImpactBps.toFixed(2)}bps`,
      );
    } else {
      console.log(
        `⚠️  TWAP slice ${state.currentSlice}/${state.numSlices}: no fill (${result.message})`,
      );
    }
  } catch (error) {
    console.error(`❌ TWAP EMS call failed (slice ${state.currentSlice}):`, error);
  }
}

async function executeTWAP(orderId: string, order: Trade): Promise<void> {
  const durationMs = order.expiresAt * 1_000;
  const numSlices = Math.max(1, Math.round(durationMs / INTERVAL_MS));
  const baseSliceQty = order.quantity / numSlices;

  const state: TwapState = {
    orderId,
    order,
    totalQty: order.quantity,
    filledQty: 0,
    costBasis: 0,
    numSlices,
    currentSlice: 0,
  };

  console.log(
    `⏳ TWAP started: ${order.quantity} ${order.asset} over ${numSlices} slices ` +
    `every ${INTERVAL_MS / 1_000}s (${(durationMs / 1_000).toFixed(0)}s total)`,
  );

  await producer?.send("algo.heartbeat", {
    algo: "TWAP",
    orderId,
    event: "start",
    asset: order.asset,
    quantity: order.quantity,
    numSlices,
    ts: Date.now(),
  }).catch(() => {});

  for (let i = 0; i < numSlices && state.filledQty < state.totalQty; i++) {
    state.currentSlice = i + 1;

    if (i > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, INTERVAL_MS));
    }

    const remaining = state.totalQty - state.filledQty;
    const sliceQty = Math.min(Math.round(baseSliceQty), remaining);

    if (sliceQty <= 0) break;

    const tick = marketClient.getLatest();
    const midPrice = tick.prices[order.asset] ?? 0;
    console.log(
      `⏳ TWAP slice ${state.currentSlice}/${numSlices}: sending ${sliceQty} ${order.asset} @ mkt ${midPrice}`,
    );
    await sendSliceToEms(state, sliceQty, midPrice);
  }

  const avgFill = state.filledQty > 0 ? (state.costBasis / state.filledQty).toFixed(4) : "N/A";
  console.log(
    `✅ TWAP complete: filled ${state.filledQty}/${state.totalQty} ${order.asset} avgFill=${avgFill}`,
  );
  await producer?.send("algo.heartbeat", {
    algo: "TWAP",
    orderId,
    event: "complete",
    asset: order.asset,
    filled: state.filledQty,
    avgFill,
    ts: Date.now(),
  }).catch(() => {});
}

const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

Deno.serve({ port: PORT }, async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  const url = new URL(req.url);
  if (url.pathname === "/health" && req.method === "GET") {
    return new Response(
      JSON.stringify({ service: "twap", version: VERSION, status: "ok" }),
      { headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  }

  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });

  try {
    const raw: Trade & { orderId?: string } = await req.json();
    const orderId = raw.orderId ?? `twap-${Date.now()}`;
    executeTWAP(orderId, raw);
    return new Response(
      JSON.stringify({ success: true, message: "TWAP execution started.", orderId }),
      { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  } catch (_error) {
    return new Response("Internal Server Error", { status: 500, headers: CORS_HEADERS });
  }
});

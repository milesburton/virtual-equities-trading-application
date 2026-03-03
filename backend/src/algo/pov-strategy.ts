import "https://deno.land/std@0.210.0/dotenv/load.ts";
import type { Trade } from "../types/types.ts";
import { MarketSimClient, type MarketTick } from "../lib/marketSimClient.ts";
import { createProducer } from "../lib/messaging.ts";

const PORT = Number(Deno.env.get("POV_ALGO_PORT")) || 5_005;
const EMS_PORT = Number(Deno.env.get("EMS_PORT")) || 5_001;
const EMS_HOST = Deno.env.get("EMS_HOST") || "localhost";
const MARKET_SIM_PORT = Number(Deno.env.get("MARKET_SIM_PORT")) || 5_000;
const MARKET_SIM_HOST = Deno.env.get("MARKET_SIM_HOST") || "localhost";

const POV_RATE = Number(Deno.env.get("POV_PERCENTAGE")) / 100 || 0.10;
const MIN_SLICE = Number(Deno.env.get("POV_MIN_SLICE")) || 10;
const MAX_SLICE = Number(Deno.env.get("POV_MAX_SLICE")) || 5_000;

console.log(`POV Algo running on port ${PORT}, rate=${(POV_RATE * 100).toFixed(0)}%`);

const marketClient = new MarketSimClient(MARKET_SIM_HOST, MARKET_SIM_PORT);
marketClient.start();

const producer = await createProducer("pov-algo").catch((err) => {
  console.warn("[pov-algo] Redpanda unavailable:", err.message);
  return null;
});

interface PovOrder {
  id: number;
  orderId: string;
  order: Trade;
  expiresAt: number;
  filledQty: number;
  costBasis: number;
}

let nextId = 1;
const activeOrders = new Map<number, PovOrder>();

async function processTickForOrder(state: PovOrder, tick: MarketTick): Promise<void> {
  const tickVolume = tick.volumes[state.order.asset] ?? 0;
  const remaining = state.order.quantity - state.filledQty;

  if (tickVolume === 0 || remaining <= 0) return;

  const rawSlice = Math.round(tickVolume * POV_RATE);
  const sliceQty = Math.max(MIN_SLICE, Math.min(MAX_SLICE, Math.min(rawSlice, remaining)));
  const childId = `${state.orderId}-pov-${Date.now()}`;

  try {
    await producer?.send("orders.child", {
      childId,
      parentOrderId: state.orderId,
      algo: "POV",
      asset: state.order.asset,
      side: state.order.side,
      quantity: sliceQty,
      limitPrice: state.order.limitPrice,
      marketPrice: tick.prices[state.order.asset] ?? 0,
      tickVolume,
      algoParams: { povRate: POV_RATE, minSlice: MIN_SLICE, maxSlice: MAX_SLICE },
      ts: Date.now(),
    }).catch(() => {});

    const res = await fetch(`http://${EMS_HOST}:${EMS_PORT}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset: state.order.asset,
        side: state.order.side,
        quantity: sliceQty,
      }),
    });
    const result = await res.json();

    if (result.filledQty > 0) {
      state.filledQty += result.filledQty;
      state.costBasis += result.filledQty * result.avgFillPrice;
      const avgFill = state.costBasis / state.filledQty;
      const pct = ((state.filledQty / state.order.quantity) * 100).toFixed(1);
      const mktPrice = tick.prices[state.order.asset] ?? "N/A";

      await producer?.send("orders.filled", {
        childId,
        parentOrderId: state.orderId,
        algo: "POV",
        asset: state.order.asset,
        side: state.order.side,
        filledQty: result.filledQty,
        avgFillPrice: result.avgFillPrice,
        marketImpactBps: result.marketImpactBps,
        totalFilled: state.filledQty,
        totalQty: state.order.quantity,
        ts: Date.now(),
      }).catch(() => {});

      console.log(
        `📊 POV [${state.id}] tick fill: ${result.filledQty} ${state.order.asset} ` +
        `@ ${result.avgFillPrice} (mkt ${mktPrice}) | ` +
        `tickVol=${tickVolume} slice=${sliceQty} ` +
        `total=${state.filledQty}/${state.order.quantity} (${pct}%) avgFill=${avgFill.toFixed(4)}`,
      );
    } else {
      console.log(`⚠️  POV [${state.id}] no fill this tick: ${result.message}`);
    }
  } catch (error) {
    console.error(`❌ POV EMS call failed [${state.id}]:`, error);
  }
}

marketClient.onTick((tick) => {
  const now = Date.now();

  for (const [id, state] of activeOrders) {
    if (now >= state.expiresAt || state.filledQty >= state.order.quantity) {
      const avgFill = state.filledQty > 0 ? (state.costBasis / state.filledQty).toFixed(4) : "N/A";
      console.log(
        `✅ POV [${id}] complete: filled ${state.filledQty}/${state.order.quantity} ${state.order.asset} avgFill=${avgFill}`,
      );
      if (now >= state.expiresAt && state.filledQty < state.order.quantity) {
        producer?.send("orders.expired", {
          orderId: state.orderId,
          algo: "POV",
          asset: state.order.asset,
          side: state.order.side,
          quantity: state.order.quantity,
          filledQty: state.filledQty,
          avgFillPrice: state.filledQty > 0 ? state.costBasis / state.filledQty : 0,
          ts: now,
        }).catch(() => {});
      }
      activeOrders.delete(id);
      continue;
    }

    processTickForOrder(state, tick);
  }

  // Heartbeat
  producer?.send("algo.heartbeat", {
    algo: "POV",
    ts: now,
    activeOrders: activeOrders.size,
  }).catch(() => {});
});

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
      JSON.stringify({
        service: "pov",
        version: VERSION,
        status: "ok",
        activeOrders: activeOrders.size,
      }),
      { headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  }

  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });

  try {
    const raw: Trade & { orderId?: string } = await req.json();
    const id = nextId++;
    const orderId = raw.orderId ?? `pov-${id}-${Date.now()}`;
    const state: PovOrder = {
      id,
      orderId,
      order: raw,
      expiresAt: Date.now() + raw.expiresAt * 1_000,
      filledQty: 0,
      costBasis: 0,
    };
    activeOrders.set(id, state);
    console.log(
      `📥 POV [${id}] order: ${raw.side} ${raw.quantity} ${raw.asset} ` +
      `rate=${(POV_RATE * 100).toFixed(0)}% expiry ${new Date(state.expiresAt).toLocaleTimeString()}`,
    );
    return new Response(
      JSON.stringify({ success: true, message: "POV execution started.", orderId }),
      { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  } catch (_error) {
    return new Response("Internal Server Error", { status: 500, headers: CORS_HEADERS });
  }
});

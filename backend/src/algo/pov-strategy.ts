/**
 * POV (Percent of Volume) algorithm
 *
 * Consumes "orders.routed" from the bus (strategy=POV).
 * On each market tick, sizes a child slice as POV_RATE × tick volume,
 * then publishes "orders.child" to the bus. EMS executes.
 */

import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { MarketSimClient, type MarketTick } from "../lib/marketSimClient.ts";
import { createConsumer, createProducer } from "../lib/messaging.ts";

const PORT = Number(Deno.env.get("POV_ALGO_PORT")) || 5_005;
const MARKET_SIM_PORT = Number(Deno.env.get("MARKET_SIM_PORT")) || 5_000;
const MARKET_SIM_HOST = Deno.env.get("MARKET_SIM_HOST") || "localhost";
const POV_RATE = Number(Deno.env.get("POV_PERCENTAGE")) / 100 || 0.10;
const MIN_SLICE = Number(Deno.env.get("POV_MIN_SLICE")) || 10;
const MAX_SLICE = Number(Deno.env.get("POV_MAX_SLICE")) || 5_000;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

console.log(`[pov-algo] Starting, rate=${(POV_RATE * 100).toFixed(0)}%`);

const marketClient = new MarketSimClient(MARKET_SIM_HOST, MARKET_SIM_PORT);
marketClient.start();

const producer = await createProducer("pov-algo").catch((err) => {
  console.warn("[pov-algo] Redpanda unavailable — orders will not be published:", err.message);
  return null;
});

interface PovOrder {
  id: number;
  orderId: string;
  clientOrderId?: string;
  asset: string;
  side: "BUY" | "SELL";
  quantity: number;
  limitPrice: number;
  expiresAt: number; // absolute ms
  filledQty: number;
  costBasis: number;
}

let nextId = 1;
const activeOrders = new Map<number, PovOrder>();

async function processTickForOrder(state: PovOrder, tick: MarketTick): Promise<void> {
  const tickVolume = tick.volumes[state.asset] ?? 0;
  const remaining = state.quantity - state.filledQty;
  if (tickVolume === 0 || remaining <= 0) return;

  const rawSlice = Math.round(tickVolume * POV_RATE);
  const sliceQty = Math.max(MIN_SLICE, Math.min(MAX_SLICE, Math.min(rawSlice, remaining)));
  const childId = `${state.orderId}-pov-${Date.now()}`;

  await producer?.send("orders.child", {
    childId,
    parentOrderId: state.orderId,
    clientOrderId: state.clientOrderId,
    algo: "POV",
    asset: state.asset,
    side: state.side,
    quantity: sliceQty,
    limitPrice: state.limitPrice,
    marketPrice: tick.prices[state.asset] ?? 0,
    tickVolume,
    algoParams: { povRate: POV_RATE, minSlice: MIN_SLICE, maxSlice: MAX_SLICE },
    ts: Date.now(),
  }).catch(() => {});
}

// Subscribe to orders.routed — filter for POV
const consumer = await createConsumer("pov-algo-routed", ["orders.routed"]).catch((err) => {
  console.warn("[pov-algo] Cannot subscribe to orders.routed:", err.message);
  return null;
});

consumer?.onMessage((_topic, raw) => {
  const order = raw as PovOrder & { strategy?: string; expiresAt?: number };
  if ((order.strategy ?? "").toUpperCase() !== "POV") return;

  const id = nextId++;
  const state: PovOrder = {
    id,
    orderId: order.orderId,
    clientOrderId: order.clientOrderId,
    asset: order.asset,
    side: order.side,
    quantity: order.quantity,
    limitPrice: order.limitPrice,
    expiresAt: Date.now() + (Number(order.expiresAt ?? 300)) * 1_000,
    filledQty: 0,
    costBasis: 0,
  };
  activeOrders.set(id, state);
  console.log(`[pov-algo] Queued [${id}] ${state.side} ${state.quantity} ${state.asset} (${state.orderId})`);
});

marketClient.onTick(async (tick) => {
  const now = Date.now();

  for (const [id, state] of activeOrders) {
    if (now >= state.expiresAt || state.filledQty >= state.quantity) {
      if (now >= state.expiresAt && state.filledQty < state.quantity) {
        await producer?.send("orders.expired", {
          orderId: state.orderId,
          clientOrderId: state.clientOrderId,
          algo: "POV",
          asset: state.asset,
          side: state.side,
          quantity: state.quantity,
          filledQty: state.filledQty,
          avgFillPrice: state.filledQty > 0 ? state.costBasis / state.filledQty : 0,
          ts: now,
        }).catch(() => {});
      }
      activeOrders.delete(id);
      continue;
    }
    await processTickForOrder(state, tick);
  }

  await producer?.send("algo.heartbeat", {
    algo: "POV",
    ts: now,
    activeOrders: activeOrders.size,
  }).catch(() => {});
});

// ── Health endpoint ───────────────────────────────────────────────────────────
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

Deno.serve({ port: PORT }, (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  const url = new URL(req.url);
  if (url.pathname === "/health" && req.method === "GET") {
    return new Response(
      JSON.stringify({ service: "pov", version: VERSION, status: "ok", activeOrders: activeOrders.size }),
      { headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  }
  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
});

// News signals — log only; future: adjust participation cap
createConsumer("pov-algo-news", ["news.signal"]).then((consumer) => {
  consumer.onMessage((_topic, raw) => {
    const sig = raw as { symbol: string; sentiment: string; score: number };
    console.log(`[pov-algo] News signal: ${sig.symbol} ${sig.sentiment} (score=${sig.score})`);
  });
}).catch(() => {}); // non-fatal

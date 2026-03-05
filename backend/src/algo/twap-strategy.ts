/**
 * TWAP (Time-Weighted Average Price) algorithm
 *
 * Consumes "orders.routed" from the bus (strategy=TWAP).
 * Divides order into N time slices; on each interval publishes "orders.child"
 * to the bus. EMS subscribes and executes the fill.
 */

import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { MarketSimClient } from "../lib/marketSimClient.ts";
import { createConsumer, createProducer } from "../lib/messaging.ts";

const PORT = Number(Deno.env.get("TWAP_ALGO_PORT")) || 5_004;
const MARKET_SIM_PORT = Number(Deno.env.get("MARKET_SIM_PORT")) || 5_000;
const MARKET_SIM_HOST = Deno.env.get("MARKET_SIM_HOST") || "localhost";
const INTERVAL_MS = Number(Deno.env.get("TWAP_INTERVAL_MS")) || 5_000;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

console.log(`[twap-algo] Starting, interval=${INTERVAL_MS}ms`);

const marketClient = new MarketSimClient(MARKET_SIM_HOST, MARKET_SIM_PORT);
marketClient.start();

const producer = await createProducer("twap-algo").catch((err) => {
  console.error("[twap-algo] Cannot connect to Redpanda:", err.message);
  Deno.exit(1);
});

interface RoutedOrder {
  orderId: string;
  clientOrderId?: string;
  asset: string;
  side: "BUY" | "SELL";
  quantity: number;
  limitPrice: number;
  expiresAt: number; // seconds duration from OMS
  strategy?: string;
  algoParams?: { numSlices?: number; participationCap?: number };
}

async function executeTWAP(order: RoutedOrder): Promise<void> {
  const durationMs = order.expiresAt * 1_000;
  const numSlices = Math.max(1, Math.round(durationMs / INTERVAL_MS));
  const baseSliceQty = order.quantity / numSlices;

  const filledQty = 0;
  const costBasis = 0;

  console.log(
    `[twap-algo] Started ${order.orderId}: ${order.quantity} ${order.asset} over ${numSlices} slices`,
  );

  await producer.send("algo.heartbeat", {
    algo: "TWAP",
    orderId: order.orderId,
    event: "start",
    asset: order.asset,
    quantity: order.quantity,
    numSlices,
    ts: Date.now(),
  }).catch(() => {});

  for (let i = 0; i < numSlices && filledQty < order.quantity; i++) {
    if (i > 0) await new Promise<void>((r) => setTimeout(r, INTERVAL_MS));

    const remaining = order.quantity - filledQty;
    const sliceQty = Math.min(Math.round(baseSliceQty), remaining);
    if (sliceQty <= 0) break;

    const tick = marketClient.getLatest();
    const marketPrice = tick.prices[order.asset] ?? 0;
    const childId = `${order.orderId}-twap-${i + 1}`;

    await producer.send("orders.child", {
      childId,
      parentOrderId: order.orderId,
      clientOrderId: order.clientOrderId,
      algo: "TWAP",
      asset: order.asset,
      side: order.side,
      quantity: sliceQty,
      limitPrice: order.limitPrice,
      marketPrice,
      sliceIndex: i,
      numSlices,
      ts: Date.now(),
    }).catch(() => {});

    console.log(
      `[twap-algo] Slice ${i + 1}/${numSlices}: ${sliceQty} ${order.asset} @ mkt ${marketPrice}`,
    );

    // Publish heartbeat so GUI can track progress
    await producer.send("algo.heartbeat", {
      algo: "TWAP",
      orderId: order.orderId,
      asset: order.asset,
      pendingOrders: numSlices - i - 1,
      ts: Date.now(),
    }).catch(() => {});
  }

  const avgFill = filledQty > 0 ? (costBasis / filledQty).toFixed(4) : "N/A";
  await producer.send("algo.heartbeat", {
    algo: "TWAP",
    orderId: order.orderId,
    event: "complete",
    asset: order.asset,
    filled: filledQty,
    avgFillPrice: avgFill,
    ts: Date.now(),
  }).catch(() => {});

  console.log(`[twap-algo] Complete ${order.orderId}: filled=${filledQty}/${order.quantity} avg=${avgFill}`);
}

// Subscribe to orders.routed — filter for TWAP
const consumer = await createConsumer("twap-algo-routed", ["orders.routed"]).catch((err) => {
  console.error("[twap-algo] Cannot subscribe to orders.routed:", err.message);
  Deno.exit(1);
});

consumer.onMessage((_topic, raw) => {
  const order = raw as RoutedOrder;
  if ((order.strategy ?? "").toUpperCase() !== "TWAP") return;
  executeTWAP(order); // fire-and-forget; errors are caught internally
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
      JSON.stringify({ service: "twap", version: VERSION, status: "ok" }),
      { headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  }
  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
});

// News signals — log only; future: adjust slice timing or participation
createConsumer("twap-algo-news", ["news.signal"]).then((consumer) => {
  consumer.onMessage((_topic, raw) => {
    const sig = raw as { symbol: string; sentiment: string; score: number };
    console.log(`[twap-algo] News signal: ${sig.symbol} ${sig.sentiment} (score=${sig.score})`);
  });
}).catch(() => {}); // non-fatal

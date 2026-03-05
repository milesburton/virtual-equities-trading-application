/**
 * LIMIT order algorithm
 *
 * Consumes "orders.routed" from the bus (strategy=LIMIT).
 * Monitors market prices via market-sim WebSocket.
 * When limit price is touched, publishes "orders.child" to the bus.
 * EMS subscribes to "orders.child" and executes the fill.
 */

import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { MarketSimClient } from "../lib/marketSimClient.ts";
import { createConsumer, createProducer } from "../lib/messaging.ts";

const MARKET_SIM_PORT = Number(Deno.env.get("MARKET_SIM_PORT")) || 5_000;
const MARKET_SIM_HOST = Deno.env.get("MARKET_SIM_HOST") || "localhost";
const PORT = Number(Deno.env.get("ALGO_TRADER_PORT")) || 5_003;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

const marketClient = new MarketSimClient(MARKET_SIM_HOST, MARKET_SIM_PORT);
marketClient.start();

const producer = await createProducer("limit-algo").catch((err) => {
  console.error("[limit-algo] Cannot connect to Redpanda:", err.message);
  Deno.exit(1);
});

interface PendingLimit {
  orderId: string;
  clientOrderId?: string;
  asset: string;
  side: "BUY" | "SELL";
  quantity: number;
  limitPrice: number;
  expiresAt: number; // absolute ms timestamp
  remainingQty: number;
  filledQty: number;
  avgFillPrice: number;
}

const pendingOrders: PendingLimit[] = [];

// Subscribe to orders.routed — filter for LIMIT strategy
const consumer = await createConsumer("limit-algo-routed", ["orders.routed"]).catch((err) => {
  console.error("[limit-algo] Cannot subscribe to orders.routed:", err.message);
  Deno.exit(1);
});

consumer.onMessage((_topic, raw) => {
  const order = raw as PendingLimit & { strategy?: string; expiresAt?: number };
  if ((order.strategy ?? "LIMIT").toUpperCase() !== "LIMIT") return;

  const pending: PendingLimit = {
    orderId: order.orderId,
    clientOrderId: order.clientOrderId,
    asset: order.asset,
    side: order.side,
    quantity: order.quantity,
    limitPrice: order.limitPrice,
    // expiresAt from OMS is seconds duration; convert to absolute ms
    expiresAt: Date.now() + (Number(order.expiresAt ?? 300)) * 1_000,
    remainingQty: order.quantity,
    filledQty: 0,
    avgFillPrice: 0,
  };

  console.log(
    `[limit-algo] Queued ${pending.side} ${pending.quantity} ${pending.asset} @ ${pending.limitPrice} (${pending.orderId})`,
  );
  pendingOrders.push(pending);
});

marketClient.onTick(async (tick) => {
  const now = Date.now();

  for (let i = pendingOrders.length - 1; i >= 0; i--) {
    const order = pendingOrders[i];
    const marketPrice = tick.prices[order.asset];
    if (!marketPrice) continue;

    // Expiry
    if (now >= order.expiresAt) {
      await producer.send("orders.expired", {
        orderId: order.orderId,
        clientOrderId: order.clientOrderId,
        algo: "LIMIT",
        asset: order.asset,
        side: order.side,
        quantity: order.quantity,
        filledQty: order.filledQty,
        avgFillPrice: order.avgFillPrice,
        ts: now,
      }).catch(() => {});
      console.log(`[limit-algo] Expired ${order.orderId} filled=${order.filledQty}/${order.quantity}`);
      pendingOrders.splice(i, 1);
      continue;
    }

    const triggered =
      (order.side === "BUY" && marketPrice <= order.limitPrice) ||
      (order.side === "SELL" && marketPrice >= order.limitPrice);

    if (triggered && order.remainingQty > 0) {
      const childId = `${order.orderId}-lim-${now}`;
      console.log(
        `[limit-algo] Triggered ${order.orderId}: ${order.side} ${order.remainingQty} ${order.asset} @ mkt ${marketPrice}`,
      );
      await producer.send("orders.child", {
        childId,
        parentOrderId: order.orderId,
        clientOrderId: order.clientOrderId,
        algo: "LIMIT",
        asset: order.asset,
        side: order.side,
        quantity: order.remainingQty,
        limitPrice: order.limitPrice,
        marketPrice,
        ts: now,
      }).catch(() => {});

      // Mark as fully sent (EMS will fill and publish orders.filled)
      order.remainingQty = 0;
      pendingOrders.splice(i, 1);
    }
  }

  await producer.send("algo.heartbeat", {
    algo: "LIMIT",
    ts: now,
    pendingOrders: pendingOrders.length,
  }).catch(() => {});
});

// ── Health endpoint (internal — not exposed to GUI) ───────────────────────────
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
      JSON.stringify({ service: "limit", version: VERSION, status: "ok", pending: pendingOrders.length }),
      { headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  }
  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
});

// News signals — log only; future: adjust limit price tolerance or pause orders
createConsumer("limit-algo-news", ["news.signal"]).then((consumer) => {
  consumer.onMessage((_topic, raw) => {
    const sig = raw as { symbol: string; sentiment: string; score: number };
    console.log(`[limit-algo] News signal: ${sig.symbol} ${sig.sentiment} (score=${sig.score})`);
  });
}).catch(() => {}); // non-fatal

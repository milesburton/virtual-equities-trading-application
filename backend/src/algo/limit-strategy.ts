import "https://deno.land/std@0.210.0/dotenv/load.ts";
import type { Trade } from "../types/types.ts";
import { MarketSimClient } from "../lib/marketSimClient.ts";
import { createProducer } from "../lib/messaging.ts";

const MARKET_SIM_PORT = Number(Deno.env.get("MARKET_SIM_PORT")) || 5_000;
const MARKET_SIM_HOST = Deno.env.get("MARKET_SIM_HOST") || "localhost";
const EMS_PORT = Number(Deno.env.get("EMS_PORT")) || 5_001;
const EMS_HOST = Deno.env.get("EMS_HOST") || "localhost";

const marketClient = new MarketSimClient(MARKET_SIM_HOST, MARKET_SIM_PORT);
marketClient.start();

const producer = await createProducer("limit-algo").catch((err) => {
  console.warn("[limit-algo] Redpanda unavailable:", err.message);
  return null;
});

interface PendingLimit extends Trade {
  orderId: string;
  remainingQty: number;
  filledQty: number;
  avgFillPrice: number;
}

const pendingOrders: PendingLimit[] = [];

async function sendToEms(order: PendingLimit, qty: number, marketPrice: number): Promise<void> {
  const childId = `${order.orderId}-lim-${Date.now()}`;
  try {
    await producer?.send("orders.child", {
      childId,
      parentOrderId: order.orderId,
      algo: "LIMIT",
      asset: order.asset,
      side: order.side,
      quantity: qty,
      limitPrice: order.limitPrice,
      marketPrice,
      algoParams: { limitPrice: order.limitPrice },
      ts: Date.now(),
    }).catch(() => {});

    const res = await fetch(`http://${EMS_HOST}:${EMS_PORT}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset: order.asset, side: order.side, quantity: qty }),
    });
    const result = await res.json();

    if (result.filledQty > 0) {
      const totalFilled = order.filledQty + result.filledQty;
      order.avgFillPrice = (order.avgFillPrice * order.filledQty + result.avgFillPrice * result.filledQty) / totalFilled;
      order.filledQty = totalFilled;
      order.remainingQty = result.remainingQty;

      await producer?.send("orders.filled", {
        childId,
        parentOrderId: order.orderId,
        algo: "LIMIT",
        asset: order.asset,
        side: order.side,
        filledQty: result.filledQty,
        avgFillPrice: result.avgFillPrice,
        marketImpactBps: result.marketImpactBps,
        totalFilled: order.filledQty,
        totalQty: order.quantity,
        ts: Date.now(),
      }).catch(() => {});

      console.log(
        `✅ LIMIT partial fill: ${result.filledQty} ${order.asset} @ ${result.avgFillPrice} | ` +
        `total filled=${order.filledQty}/${order.quantity} avgFill=${order.avgFillPrice.toFixed(4)}`,
      );
    }
  } catch (error) {
    console.error("❌ EMS call failed:", error);
  }
}

marketClient.onTick(async (tick) => {
  const now = Date.now();

  for (let i = pendingOrders.length - 1; i >= 0; i--) {
    const order = pendingOrders[i];
    const marketPrice = tick.prices[order.asset];

    if (!marketPrice) continue;

    if (now >= order.expiresAt) {
      console.log(
        `⏳ LIMIT order expired: ${order.side} ${order.quantity} ${order.asset} | ` +
        `filled=${order.filledQty} avg=${order.avgFillPrice.toFixed(4)}`,
      );
      await producer?.send("orders.expired", {
        orderId: order.orderId,
        algo: "LIMIT",
        asset: order.asset,
        side: order.side,
        quantity: order.quantity,
        filledQty: order.filledQty,
        avgFillPrice: order.avgFillPrice,
        ts: now,
      }).catch(() => {});
      pendingOrders.splice(i, 1);
      continue;
    }

    const triggered =
      (order.side === "BUY" && marketPrice <= order.limitPrice) ||
      (order.side === "SELL" && marketPrice >= order.limitPrice);

    if (triggered && order.remainingQty > 0) {
      console.log(
        `🎯 LIMIT triggered: ${order.side} ${order.remainingQty} ${order.asset} @ market ${marketPrice} (limit ${order.limitPrice})`,
      );
      await sendToEms(order, order.remainingQty, marketPrice);

      if (order.remainingQty <= 0) {
        pendingOrders.splice(i, 1);
      }
    }
  }

  // Heartbeat
  await producer?.send("algo.heartbeat", {
    algo: "LIMIT",
    ts: now,
    pendingOrders: pendingOrders.length,
  }).catch(() => {});
});

const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const PORT = Number(Deno.env.get("ALGO_TRADER_PORT")) || 5_003;

Deno.serve({ port: PORT }, async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  if (url.pathname === "/health" && req.method === "GET") {
    return new Response(
      JSON.stringify({
        service: "limit",
        version: VERSION,
        status: "ok",
        pending: pendingOrders.length,
      }),
      { headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  }

  if (req.method === "POST") {
    try {
      const raw: Trade & { orderId?: string } = await req.json();
      const order: PendingLimit = {
        ...raw,
        orderId: raw.orderId ?? `limit-${Date.now()}`,
        expiresAt: Date.now() + raw.expiresAt * 1_000,
        remainingQty: raw.quantity,
        filledQty: 0,
        avgFillPrice: 0,
      };
      console.log(
        `📥 LIMIT order received: ${order.side} ${order.quantity} ${order.asset} ` +
        `@ limit ${order.limitPrice} expiry ${new Date(order.expiresAt).toLocaleTimeString()}`,
      );
      pendingOrders.push(order);
      return new Response(
        JSON.stringify({ success: true, message: "Limit order queued.", orderId: order.orderId }),
        { headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
      );
    } catch {
      return new Response(
        JSON.stringify({ success: false, message: "Invalid trade request." }),
        { headers: { "Content-Type": "application/json", ...CORS_HEADERS }, status: 400 },
      );
    }
  }

  return new Response("Limit Order Algo Running", { status: 200, headers: CORS_HEADERS });
});

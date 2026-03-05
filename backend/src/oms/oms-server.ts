/**
 * Order Management System (OMS)
 *
 * Subscribes to "orders.new" from the message bus (published by the gateway
 * when the GUI submits an order). Validates, enriches, assigns a canonical
 * order ID, and publishes routing events before dispatching to algo services.
 *
 * All inter-service communication is via Redpanda. The OMS no longer exposes
 * an HTTP order-submission endpoint; algos are notified via "orders.routed".
 *
 * HTTP surface (internal, not exposed to GUI):
 *   GET /health — liveness probe
 */

import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { serve } from "https://deno.land/std@0.210.0/http/server.ts";
import { createConsumer, createProducer } from "../lib/messaging.ts";

const PORT = Number(Deno.env.get("OMS_PORT")) || 5_002;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";
const USER_SERVICE_URL = `http://${Deno.env.get("USER_SERVICE_HOST") ?? "localhost"}:${Deno.env.get("USER_SERVICE_PORT") ?? "5008"}`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const KNOWN_STRATEGIES = new Set(["LIMIT", "TWAP", "POV", "VWAP"]);

// ── Trading limits cache ──────────────────────────────────────────────────────

interface TradingLimits {
  max_order_qty: number;
  max_daily_notional: number;
  allowed_strategies: string[];
}

/** Default permissive limits used when user-service is unavailable. */
const DEFAULT_LIMITS: TradingLimits = {
  max_order_qty: 10_000,
  max_daily_notional: 1_000_000,
  allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP"],
};

const limitsCache = new Map<string, { limits: TradingLimits; expiresAt: number }>();

async function getUserLimits(userId: string): Promise<TradingLimits> {
  const now = Date.now();
  const cached = limitsCache.get(userId);
  if (cached) {
    if (cached.expiresAt > now) return cached.limits;
    limitsCache.delete(userId); // evict expired entry
  }

  try {
    const res = await fetch(`${USER_SERVICE_URL}/users/${encodeURIComponent(userId)}/limits`, {
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) return DEFAULT_LIMITS;
    const data = await res.json() as { max_order_qty: number; max_daily_notional: number; allowed_strategies: string[] };
    const limits: TradingLimits = {
      max_order_qty: data.max_order_qty,
      max_daily_notional: data.max_daily_notional,
      allowed_strategies: data.allowed_strategies,
    };
    limitsCache.set(userId, { limits, expiresAt: now + 30_000 }); // cache for 30s
    return limits;
  } catch {
    return DEFAULT_LIMITS;
  }
}

// Monotonically increasing sequence number for this session
let seqNum = 1;

function nextOrderId(): string {
  return `oms-${Date.now()}-${seqNum++}`;
}

// ── Bus connections ───────────────────────────────────────────────────────────

const producer = await createProducer("oms").catch((err) => {
  console.error("[oms] Cannot connect to Redpanda — OMS cannot function:", err.message);
  Deno.exit(1);
});

// Subscribe to orders.new — published by gateway when GUI submits
const consumer = await createConsumer("oms-new-orders", ["orders.new"]).catch((err) => {
  console.error("[oms] Cannot subscribe to orders.new:", err.message);
  Deno.exit(1);
});

interface NewOrder {
  // Fields from the GUI Trade object
  asset: string;
  side: "BUY" | "SELL";
  quantity: number;
  limitPrice: number;
  expiresAt: number;       // seconds
  strategy?: string;
  algoParams?: Record<string, unknown>;
  // Optional client-generated ID from GUI (used for idempotency)
  clientOrderId?: string;
  // Injected by gateway after authentication
  userId?: string;
  userRole?: string;
}

consumer.onMessage(async (_topic, raw) => {
  const order = raw as NewOrder;

  // ── Basic field validation ────────────────────────────────────────────────
  if (!order.asset || !order.side || !order.quantity) {
    console.warn("[oms] Malformed order — missing required fields");
    await producer.send("orders.rejected", {
      clientOrderId: order.clientOrderId,
      userId: order.userId,
      reason: "Missing required fields: asset, side, quantity",
      ts: Date.now(),
    }).catch(() => {});
    return;
  }

  const strategy = (order.strategy ?? "LIMIT").toUpperCase();
  if (!KNOWN_STRATEGIES.has(strategy)) {
    console.warn(`[oms] Unknown strategy "${strategy}" — rejecting order`);
    await producer.send("orders.rejected", {
      clientOrderId: order.clientOrderId,
      userId: order.userId,
      reason: `Unknown strategy: ${strategy}`,
      ts: Date.now(),
    }).catch(() => {});
    return;
  }

  // ── Role enforcement — admins cannot trade ────────────────────────────────
  if (order.userRole === "admin") {
    console.warn(`[oms] Order rejected — admin user ${order.userId} attempted to submit an order`);
    await producer.send("orders.rejected", {
      clientOrderId: order.clientOrderId,
      userId: order.userId,
      reason: "Admin accounts are not permitted to submit orders",
      ts: Date.now(),
    }).catch(() => {});
    return;
  }

  // ── Trading limit enforcement ─────────────────────────────────────────────
  if (order.userId) {
    const limits = await getUserLimits(order.userId);

    if (order.quantity > limits.max_order_qty) {
      console.warn(`[oms] Order rejected — quantity ${order.quantity} exceeds limit ${limits.max_order_qty} for user ${order.userId}`);
      await producer.send("orders.rejected", {
        clientOrderId: order.clientOrderId,
        userId: order.userId,
        reason: `Order quantity ${order.quantity} exceeds your limit of ${limits.max_order_qty}`,
        ts: Date.now(),
      }).catch(() => {});
      return;
    }

    if (!limits.allowed_strategies.includes(strategy)) {
      console.warn(`[oms] Order rejected — strategy ${strategy} not permitted for user ${order.userId}`);
      await producer.send("orders.rejected", {
        clientOrderId: order.clientOrderId,
        userId: order.userId,
        reason: `Strategy ${strategy} is not permitted for your account`,
        ts: Date.now(),
      }).catch(() => {});
      return;
    }

    const notional = order.quantity * (order.limitPrice ?? 0);
    if (notional > limits.max_daily_notional) {
      console.warn(`[oms] Order rejected — notional ${notional} exceeds daily limit ${limits.max_daily_notional} for user ${order.userId}`);
      await producer.send("orders.rejected", {
        clientOrderId: order.clientOrderId,
        userId: order.userId,
        reason: `Order notional $${notional.toLocaleString()} exceeds your daily limit of $${limits.max_daily_notional.toLocaleString()}`,
        ts: Date.now(),
      }).catch(() => {});
      return;
    }
  }

  const orderId = nextOrderId();
  const ts = Date.now();
  const expiresInSecs = Number(order.expiresAt ?? 0);
  const timeInForce = expiresInSecs <= 0 ? "GTC" : expiresInSecs <= 60 ? "IOC" : "DAY";
  const destinationVenue = "XNAS";
  const accountId = "ACC-001";

  const enriched = {
    orderId,
    clientOrderId: order.clientOrderId,
    userId: order.userId,
    ts,
    timeInForce,
    destinationVenue,
    accountId,
    asset: order.asset,
    side: order.side,
    quantity: order.quantity,
    limitPrice: order.limitPrice,
    expiresAt: order.expiresAt,
    strategy,
    algoParams: order.algoParams ?? {},
  };

  console.log(`[oms] Accepted ${strategy} order ${orderId}: ${order.side} ${order.quantity} ${order.asset} (user=${order.userId ?? "unknown"})`);

  await producer.send("orders.submitted", enriched).catch(() => {});
  await producer.send("orders.routed", { ...enriched, routedAt: Date.now() }).catch(() => {});
});

console.log(`[oms] Listening for orders.new on message bus`);

// ── Health endpoint ───────────────────────────────────────────────────────────

serve((req) => {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (url.pathname === "/health" && req.method === "GET") {
    return new Response(
      JSON.stringify({ service: "oms", version: VERSION, status: "ok" }),
      { headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  }
  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
}, { port: PORT });

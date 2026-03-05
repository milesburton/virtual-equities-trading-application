/**
 * Unit tests for OMS order validation logic.
 *
 * These tests exercise the validation rules in isolation without starting
 * a Redpanda connection or HTTP server.
 */

import {
  assertEquals,
  assertMatch,
} from "https://deno.land/std@0.210.0/testing/asserts.ts";

// ── Replicate the pure validation logic from oms-server.ts ───────────────────
// These are the rules that run before any bus interaction.

interface TradingLimits {
  max_order_qty: number;
  max_daily_notional: number;
  allowed_strategies: string[];
}

const KNOWN_STRATEGIES = new Set(["LIMIT", "TWAP", "POV", "VWAP"]);

interface Order {
  asset?: string;
  side?: string;
  quantity?: number;
  limitPrice?: number;
  strategy?: string;
  userId?: string;
  userRole?: string;
  clientOrderId?: string;
}

type ValidationResult =
  | { ok: true; strategy: string }
  | { ok: false; reason: string };

function validateOrder(order: Order, limits: TradingLimits): ValidationResult {
  if (!order.asset || !order.side || !order.quantity) {
    return { ok: false, reason: "Missing required fields: asset, side, quantity" };
  }

  const strategy = (order.strategy ?? "LIMIT").toUpperCase();
  if (!KNOWN_STRATEGIES.has(strategy)) {
    return { ok: false, reason: `Unknown strategy: ${strategy}` };
  }

  if (order.userRole === "admin") {
    return { ok: false, reason: "Admin accounts are not permitted to submit orders" };
  }

  if (order.userId) {
    if (order.quantity > limits.max_order_qty) {
      return { ok: false, reason: `Order quantity ${order.quantity} exceeds your limit of ${limits.max_order_qty}` };
    }

    if (!limits.allowed_strategies.includes(strategy)) {
      return { ok: false, reason: `Strategy ${strategy} is not permitted for your account` };
    }

    const notional = order.quantity * (order.limitPrice ?? 0);
    if (notional > limits.max_daily_notional) {
      return { ok: false, reason: `Order notional $${notional.toLocaleString()} exceeds your daily limit of $${limits.max_daily_notional.toLocaleString()}` };
    }
  }

  return { ok: true, strategy };
}

const DEFAULT_LIMITS: TradingLimits = {
  max_order_qty: 10_000,
  max_daily_notional: 1_000_000,
  allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP"],
};

const VALID_ORDER: Order = {
  asset: "AAPL",
  side: "BUY",
  quantity: 100,
  limitPrice: 190,
  strategy: "LIMIT",
  userId: "user-1",
  userRole: "trader",
};

// ── Missing field validation ──────────────────────────────────────────────────

Deno.test("[oms] rejects order missing asset", () => {
  const result = validateOrder({ ...VALID_ORDER, asset: undefined }, DEFAULT_LIMITS);
  assertEquals(result.ok, false);
  if (!result.ok) assertMatch(result.reason, /Missing required fields/);
});

Deno.test("[oms] rejects order missing side", () => {
  const result = validateOrder({ ...VALID_ORDER, side: undefined }, DEFAULT_LIMITS);
  assertEquals(result.ok, false);
});

Deno.test("[oms] rejects order missing quantity", () => {
  const result = validateOrder({ ...VALID_ORDER, quantity: undefined }, DEFAULT_LIMITS);
  assertEquals(result.ok, false);
});

// ── Strategy validation ───────────────────────────────────────────────────────

Deno.test("[oms] accepts known strategies", () => {
  for (const strategy of ["LIMIT", "TWAP", "POV", "VWAP"]) {
    const result = validateOrder({ ...VALID_ORDER, strategy }, DEFAULT_LIMITS);
    assertEquals(result.ok, true, `strategy ${strategy} should be accepted`);
  }
});

Deno.test("[oms] normalises strategy to uppercase", () => {
  const result = validateOrder({ ...VALID_ORDER, strategy: "limit" }, DEFAULT_LIMITS);
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.strategy, "LIMIT");
});

Deno.test("[oms] rejects unknown strategy", () => {
  const result = validateOrder({ ...VALID_ORDER, strategy: "ICEBERG" }, DEFAULT_LIMITS);
  assertEquals(result.ok, false);
  if (!result.ok) assertMatch(result.reason, /Unknown strategy/);
});

Deno.test("[oms] defaults missing strategy to LIMIT", () => {
  const result = validateOrder({ ...VALID_ORDER, strategy: undefined }, DEFAULT_LIMITS);
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.strategy, "LIMIT");
});

// ── Role enforcement ──────────────────────────────────────────────────────────

Deno.test("[oms] rejects orders from admin role", () => {
  const result = validateOrder({ ...VALID_ORDER, userRole: "admin" }, DEFAULT_LIMITS);
  assertEquals(result.ok, false);
  if (!result.ok) assertMatch(result.reason, /Admin accounts/);
});

Deno.test("[oms] accepts orders from trader role", () => {
  const result = validateOrder({ ...VALID_ORDER, userRole: "trader" }, DEFAULT_LIMITS);
  assertEquals(result.ok, true);
});

// ── Trading limit enforcement ─────────────────────────────────────────────────

Deno.test("[oms] rejects quantity exceeding max_order_qty", () => {
  const limits = { ...DEFAULT_LIMITS, max_order_qty: 50 };
  const result = validateOrder({ ...VALID_ORDER, quantity: 100 }, limits);
  assertEquals(result.ok, false);
  if (!result.ok) assertMatch(result.reason, /exceeds your limit/);
});

Deno.test("[oms] accepts quantity at exactly max_order_qty", () => {
  const limits = { ...DEFAULT_LIMITS, max_order_qty: 100 };
  const result = validateOrder({ ...VALID_ORDER, quantity: 100 }, limits);
  assertEquals(result.ok, true);
});

Deno.test("[oms] rejects strategy not in allowed_strategies", () => {
  const limits = { ...DEFAULT_LIMITS, allowed_strategies: ["LIMIT"] };
  const result = validateOrder({ ...VALID_ORDER, strategy: "TWAP" }, limits);
  assertEquals(result.ok, false);
  if (!result.ok) assertMatch(result.reason, /not permitted for your account/);
});

Deno.test("[oms] accepts strategy in allowed_strategies", () => {
  const limits = { ...DEFAULT_LIMITS, allowed_strategies: ["LIMIT", "TWAP"] };
  const result = validateOrder({ ...VALID_ORDER, strategy: "TWAP" }, limits);
  assertEquals(result.ok, true);
});

Deno.test("[oms] rejects order where notional exceeds max_daily_notional", () => {
  const limits = { ...DEFAULT_LIMITS, max_daily_notional: 1_000 };
  // 100 qty * 190 price = 19_000 notional > 1_000 limit
  const result = validateOrder({ ...VALID_ORDER, quantity: 100, limitPrice: 190 }, limits);
  assertEquals(result.ok, false);
  if (!result.ok) assertMatch(result.reason, /exceeds your daily limit/);
});

Deno.test("[oms] accepts order where notional equals max_daily_notional", () => {
  const limits = { ...DEFAULT_LIMITS, max_daily_notional: 19_000 };
  const result = validateOrder({ ...VALID_ORDER, quantity: 100, limitPrice: 190 }, limits);
  assertEquals(result.ok, true);
});

Deno.test("[oms] skips limit checks when userId is absent (anonymous)", () => {
  const limits = { ...DEFAULT_LIMITS, max_order_qty: 1 };
  // quantity 100 > limit 1, but no userId → limits not checked
  const result = validateOrder({ ...VALID_ORDER, userId: undefined }, limits);
  assertEquals(result.ok, true);
});

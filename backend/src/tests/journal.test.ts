/**
 * Unit tests for journal order reconstruction logic.
 *
 * Tests the pure logic that rebuilds OrderRecord objects from a sequence of
 * journal events — the same logic used by the GET /orders endpoint.
 */

import {
  assertEquals,
} from "https://deno.land/std@0.210.0/testing/asserts.ts";

// ── Replicate the reconstruction logic from journal-server.ts ─────────────────

interface OrderRecord {
  id: string;
  submittedAt: number;
  asset: string;
  side: string;
  quantity: number;
  limitPrice: number;
  expiresAt: number;
  strategy: string;
  status: string;
  filled: number;
  rejectReason?: unknown;
  algoParams: unknown;
  children: unknown[];
}

type JournalEvent = {
  orderId: string;
  eventType: string;
  ts: number;
  raw: Record<string, unknown>;
};

function reconstructOrders(events: JournalEvent[]): OrderRecord[] {
  const orderMap = new Map<string, OrderRecord>();

  for (const { orderId, eventType, ts, raw } of events) {
    if (eventType === "orders.rejected" && !orderMap.has(orderId)) {
      orderMap.set(orderId, {
        id: orderId,
        submittedAt: ts,
        asset: (raw.asset ?? raw.instrument ?? "") as string,
        side: (raw.side ?? "BUY") as string,
        quantity: Number(raw.quantity ?? raw.requestedQty ?? 0),
        limitPrice: Number(raw.limitPrice ?? 0),
        expiresAt: ts + 86_400_000,
        strategy: (raw.strategy ?? raw.algo ?? "LIMIT") as string,
        status: "rejected",
        rejectReason: raw.reason ?? raw.message ?? null,
        filled: 0,
        algoParams: raw.algoParams ?? { strategy: raw.strategy ?? "LIMIT" },
        children: [],
      });
    } else if (eventType === "orders.submitted") {
      orderMap.set(orderId, {
        id: orderId,
        submittedAt: ts,
        asset: (raw.asset ?? raw.instrument ?? "") as string,
        side: (raw.side ?? "BUY") as string,
        quantity: Number(raw.quantity ?? raw.requestedQty ?? 0),
        limitPrice: Number(raw.limitPrice ?? 0),
        expiresAt: Number(raw.expiresAt ?? ts + 86_400_000),
        strategy: (raw.strategy ?? raw.algo ?? "LIMIT") as string,
        status: "queued",
        filled: 0,
        algoParams: raw.algoParams ?? { strategy: raw.strategy ?? "LIMIT" },
        children: [],
      });
    } else if (orderMap.has(orderId)) {
      const order = orderMap.get(orderId)!;
      if (eventType === "orders.filled") {
        const childFilled = Number(raw.filledQty ?? 0);
        order.filled = Number(order.filled ?? 0) + childFilled;
        order.status = order.quantity > 0 && order.filled >= order.quantity ? "filled" : "executing";
      } else if (eventType === "orders.expired") {
        order.status = "expired";
      } else if (eventType === "orders.rejected") {
        order.status = "rejected";
        if (raw.reason) order.rejectReason = raw.reason;
      } else if (eventType === "orders.child") {
        order.children.push({
          id: raw.childId ?? raw.orderId ?? "",
          side: raw.side ?? order.side,
          quantity: raw.qty ?? raw.quantity ?? 0,
          limitPrice: raw.price ?? raw.limitPrice ?? 0,
        });
      }
    }
  }

  return [...orderMap.values()];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const BASE_ORDER = {
  orderId: "ord-1",
  ts: 1_000_000,
  raw: {
    asset: "AAPL",
    side: "BUY",
    quantity: 100,
    limitPrice: 190,
    strategy: "TWAP",
    expiresAt: 1_086_400_000,
    algoParams: { strategy: "TWAP", numSlices: 4 },
  },
};

Deno.test("[journal] reconstructs queued order from orders.submitted", () => {
  const orders = reconstructOrders([{ ...BASE_ORDER, eventType: "orders.submitted" }]);
  assertEquals(orders.length, 1);
  assertEquals(orders[0].status, "queued");
  assertEquals(orders[0].asset, "AAPL");
  assertEquals(orders[0].quantity, 100);
  assertEquals(orders[0].filled, 0);
});

Deno.test("[journal] transitions to executing after first partial fill", () => {
  const orders = reconstructOrders([
    { ...BASE_ORDER, eventType: "orders.submitted" },
    { ...BASE_ORDER, eventType: "orders.filled", raw: { ...BASE_ORDER.raw, filledQty: 25 } },
  ]);
  assertEquals(orders[0].status, "executing");
  assertEquals(orders[0].filled, 25);
});

Deno.test("[journal] accumulates fills across multiple child orders", () => {
  const orders = reconstructOrders([
    { ...BASE_ORDER, eventType: "orders.submitted" },
    { ...BASE_ORDER, eventType: "orders.filled", raw: { filledQty: 25 } },
    { ...BASE_ORDER, eventType: "orders.filled", raw: { filledQty: 25 } },
    { ...BASE_ORDER, eventType: "orders.filled", raw: { filledQty: 25 } },
    { ...BASE_ORDER, eventType: "orders.filled", raw: { filledQty: 25 } },
  ]);
  assertEquals(orders[0].filled, 100);
  assertEquals(orders[0].status, "filled");
});

Deno.test("[journal] transitions to filled when filled >= quantity", () => {
  const orders = reconstructOrders([
    { ...BASE_ORDER, eventType: "orders.submitted" },
    { ...BASE_ORDER, eventType: "orders.filled", raw: { filledQty: 100 } },
  ]);
  assertEquals(orders[0].status, "filled");
});

Deno.test("[journal] marks order as expired", () => {
  const orders = reconstructOrders([
    { ...BASE_ORDER, eventType: "orders.submitted" },
    { ...BASE_ORDER, eventType: "orders.filled", raw: { filledQty: 50 } },
    { ...BASE_ORDER, eventType: "orders.expired", raw: {} },
  ]);
  assertEquals(orders[0].status, "expired");
  assertEquals(orders[0].filled, 50);
});

Deno.test("[journal] marks OMS-rejected order as rejected (after submission)", () => {
  const orders = reconstructOrders([
    { ...BASE_ORDER, eventType: "orders.submitted" },
    { ...BASE_ORDER, eventType: "orders.rejected", raw: { reason: "Limit exceeded" } },
  ]);
  assertEquals(orders[0].status, "rejected");
  assertEquals(orders[0].rejectReason, "Limit exceeded");
});

Deno.test("[journal] creates stub for gateway-rejected order (no prior submission)", () => {
  const orders = reconstructOrders([
    {
      orderId: "ord-gw",
      eventType: "orders.rejected",
      ts: 2_000_000,
      raw: { asset: "MSFT", side: "SELL", quantity: 50, reason: "Session expired" },
    },
  ]);
  assertEquals(orders.length, 1);
  assertEquals(orders[0].status, "rejected");
  assertEquals(orders[0].asset, "MSFT");
  assertEquals(orders[0].rejectReason, "Session expired");
});

Deno.test("[journal] appends child orders", () => {
  const orders = reconstructOrders([
    { ...BASE_ORDER, eventType: "orders.submitted" },
    {
      ...BASE_ORDER,
      eventType: "orders.child",
      raw: { childId: "child-1", side: "BUY", quantity: 25, limitPrice: 190 },
    },
  ]);
  assertEquals(orders[0].children.length, 1);
});

Deno.test("[journal] handles multiple independent orders", () => {
  const orders = reconstructOrders([
    { orderId: "ord-A", eventType: "orders.submitted", ts: 1000, raw: { asset: "AAPL", side: "BUY", quantity: 100, limitPrice: 190, strategy: "LIMIT" } },
    { orderId: "ord-B", eventType: "orders.submitted", ts: 2000, raw: { asset: "MSFT", side: "SELL", quantity: 50, limitPrice: 400, strategy: "TWAP" } },
    { orderId: "ord-A", eventType: "orders.filled", ts: 3000, raw: { filledQty: 100 } },
  ]);
  assertEquals(orders.length, 2);
  const a = orders.find((o) => o.id === "ord-A")!;
  const b = orders.find((o) => o.id === "ord-B")!;
  assertEquals(a.status, "filled");
  assertEquals(b.status, "queued");
});

Deno.test("[journal] ignores events for unknown orderId", () => {
  const orders = reconstructOrders([
    { orderId: "ord-1", eventType: "orders.filled", ts: 1000, raw: { filledQty: 50 } },
  ]);
  // No orders.submitted → no entry in map → ignored
  assertEquals(orders.length, 0);
});

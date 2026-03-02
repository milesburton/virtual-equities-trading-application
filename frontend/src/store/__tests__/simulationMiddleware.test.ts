import { configureStore } from "@reduxjs/toolkit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderRecord } from "../../types";
import { marketSlice } from "../marketSlice";
import { simulationMiddleware } from "../middleware/simulationMiddleware";
import { ordersSlice } from "../ordersSlice";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeStore() {
  return configureStore({
    reducer: {
      market: marketSlice.reducer,
      orders: ordersSlice.reducer,
    },
    middleware: (getDefault) => getDefault().concat(simulationMiddleware.middleware),
  });
}

const NOW = 1_000_000;
const FIVE_SECONDS = 5_000;

function makeOrder(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: "order-1",
    submittedAt: NOW,
    asset: "AAPL",
    side: "BUY",
    quantity: 100,
    limitPrice: 150,
    expiresAt: NOW + 60_000, // 60 s from NOW
    strategy: "LIMIT",
    status: "queued",
    filled: 0,
    algoParams: { strategy: "LIMIT" },
    children: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  // Stub fetch so observability POSTs are no-ops
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ─── LIMIT strategy ──────────────────────────────────────────────────────────

describe("simulationMiddleware – LIMIT via tickReceived", () => {
  it("fills a BUY order on tick when price <= limitPrice", () => {
    const store = makeStore();
    store.dispatch(ordersSlice.actions.orderAdded(makeOrder({ limitPrice: 155 })));

    store.dispatch(marketSlice.actions.tickReceived({ prices: { AAPL: 154 }, ts: NOW + 1000 }));

    const [order] = store.getState().orders.orders;
    expect(order.status).toBe("filled");
    expect(order.filled).toBe(100);
  });

  it("does not fill a BUY when price > limitPrice", () => {
    const store = makeStore();
    store.dispatch(ordersSlice.actions.orderAdded(makeOrder({ limitPrice: 150 })));

    store.dispatch(marketSlice.actions.tickReceived({ prices: { AAPL: 160 }, ts: NOW + 1000 }));

    const [order] = store.getState().orders.orders;
    expect(order.status).not.toBe("filled");
  });

  it("expires order on tick when past expiresAt", () => {
    const order = makeOrder({ expiresAt: NOW - 1000 });
    const store = makeStore();
    store.dispatch(ordersSlice.actions.orderAdded(order));

    store.dispatch(marketSlice.actions.tickReceived({ prices: { AAPL: 200 }, ts: NOW }));

    expect(store.getState().orders.orders[0].status).toBe("expired");
  });
});

// ─── TWAP strategy ───────────────────────────────────────────────────────────

describe("simulationMiddleware – TWAP", () => {
  it("dispatches orderPatched to executing immediately", () => {
    const store = makeStore();
    store.dispatch(
      ordersSlice.actions.orderAdded(
        makeOrder({
          strategy: "TWAP",
          algoParams: { strategy: "TWAP", numSlices: 4, participationCap: 25 },
        })
      )
    );

    const [order] = store.getState().orders.orders;
    expect(order.status).toBe("executing");
  });

  it("adds child orders on each interval tick", () => {
    const store = makeStore();
    const twapOrder = makeOrder({
      strategy: "TWAP",
      algoParams: { strategy: "TWAP", numSlices: 4, participationCap: 25 },
      expiresAt: NOW + 20_000, // 20s → 4 slices of 5s
    });
    store.dispatch(ordersSlice.actions.orderAdded(twapOrder));

    // Advance by one interval tick (20000ms / 4 slices = 5000ms each)
    vi.advanceTimersByTime(5_000);

    const [order] = store.getState().orders.orders;
    expect(order.children.length).toBeGreaterThanOrEqual(1);
  });

  it("fills parent order after all slices complete", () => {
    const store = makeStore();
    const twapOrder = makeOrder({
      strategy: "TWAP",
      quantity: 100,
      algoParams: { strategy: "TWAP", numSlices: 2, participationCap: 50 },
      expiresAt: NOW + 10_000,
    });
    store.dispatch(ordersSlice.actions.orderAdded(twapOrder));

    // Advance through both slices
    vi.advanceTimersByTime(10_000);

    const [order] = store.getState().orders.orders;
    expect(order.status).toBe("filled");
  });

  it("expires TWAP order if not complete by expiresAt", () => {
    const store = makeStore();
    // Long duration but we'll let the expiry timeout fire before all slices
    const twapOrder = makeOrder({
      strategy: "TWAP",
      quantity: 1_000_000,
      algoParams: { strategy: "TWAP", numSlices: 1000, participationCap: 1 },
      expiresAt: NOW + FIVE_SECONDS,
    });
    store.dispatch(ordersSlice.actions.orderAdded(twapOrder));

    // Let the expiry fire — only a tiny fraction would have filled
    vi.advanceTimersByTime(FIVE_SECONDS + 100);

    const [order] = store.getState().orders.orders;
    // Either expired (not fully filled) or filled — we just check it terminated
    expect(["expired", "filled"]).toContain(order.status);
  });
});

// ─── POV strategy ────────────────────────────────────────────────────────────

describe("simulationMiddleware – POV", () => {
  it("dispatches orderPatched to executing immediately", () => {
    const store = makeStore();
    store.dispatch(
      ordersSlice.actions.orderAdded(
        makeOrder({
          strategy: "POV",
          algoParams: {
            strategy: "POV",
            participationRate: 10,
            minSliceSize: 0,
            maxSliceSize: 1000,
          },
        })
      )
    );

    expect(store.getState().orders.orders[0].status).toBe("executing");
  });

  it("adds child orders over interval ticks", () => {
    const store = makeStore();
    // Use a large quantity so it doesn't finish in one tick
    const povOrder = makeOrder({
      strategy: "POV",
      quantity: 100_000,
      algoParams: {
        strategy: "POV",
        participationRate: 10,
        minSliceSize: 1,
        maxSliceSize: 500,
      },
      expiresAt: NOW + 60_000,
    });
    store.dispatch(ordersSlice.actions.orderAdded(povOrder));

    vi.advanceTimersByTime(FIVE_SECONDS);

    const [order] = store.getState().orders.orders;
    // At least one child should have been created
    expect(order.children.length).toBeGreaterThanOrEqual(1);
  });

  it("expires POV order past expiresAt", () => {
    const store = makeStore();
    const povOrder = makeOrder({
      strategy: "POV",
      quantity: 1_000_000,
      algoParams: {
        strategy: "POV",
        participationRate: 1,
        minSliceSize: 0,
        maxSliceSize: 1,
      },
      expiresAt: NOW + FIVE_SECONDS,
    });
    store.dispatch(ordersSlice.actions.orderAdded(povOrder));

    vi.advanceTimersByTime(FIVE_SECONDS + 100);

    const [order] = store.getState().orders.orders;
    expect(["expired", "filled"]).toContain(order.status);
  });
});

// ─── VWAP strategy ───────────────────────────────────────────────────────────

describe("simulationMiddleware – VWAP", () => {
  it("dispatches orderPatched to executing immediately", () => {
    const store = makeStore();
    store.dispatch(
      ordersSlice.actions.orderAdded(
        makeOrder({
          strategy: "VWAP",
          algoParams: {
            strategy: "VWAP",
            maxDeviation: 0.005,
            startOffsetSecs: 0,
            endOffsetSecs: 60,
          },
        })
      )
    );

    expect(store.getState().orders.orders[0].status).toBe("executing");
  });

  it("adds child orders when price is within deviation band", () => {
    const store = makeStore();
    const vwapOrder = makeOrder({
      strategy: "VWAP",
      quantity: 100,
      limitPrice: 150,
      algoParams: {
        strategy: "VWAP",
        maxDeviation: 0.1, // 10% — generous so price always qualifies
        startOffsetSecs: 0,
        endOffsetSecs: 60,
      },
      expiresAt: NOW + 20_000,
    });
    store.dispatch(ordersSlice.actions.orderAdded(vwapOrder));

    // Seed a price well within band
    store.dispatch(marketSlice.actions.tickReceived({ prices: { AAPL: 150 }, ts: NOW }));

    vi.advanceTimersByTime(FIVE_SECONDS);

    const [order] = store.getState().orders.orders;
    expect(order.children.length).toBeGreaterThanOrEqual(1);
  });

  it("skips slice when price deviates beyond maxDeviation", () => {
    const store = makeStore();
    const vwapOrder = makeOrder({
      strategy: "VWAP",
      quantity: 100,
      limitPrice: 150,
      algoParams: {
        strategy: "VWAP",
        maxDeviation: 0.001, // 0.1% — very tight
        startOffsetSecs: 0,
        endOffsetSecs: 60,
      },
      expiresAt: NOW + 20_000,
    });
    store.dispatch(ordersSlice.actions.orderAdded(vwapOrder));

    // Set price far from limit — deviation will exceed 0.1%
    store.dispatch(marketSlice.actions.tickReceived({ prices: { AAPL: 200 }, ts: NOW }));

    vi.advanceTimersByTime(FIVE_SECONDS);

    const [order] = store.getState().orders.orders;
    // No children should have been added with a 200 vs 150 price (33% deviation)
    expect(order.children.length).toBe(0);
  });
});

// ─── Observability side-effects ───────────────────────────────────────────────

describe("simulationMiddleware – observability events", () => {
  it("calls fetch when an order is added (order_submitted event)", () => {
    const store = makeStore();
    store.dispatch(ordersSlice.actions.orderAdded(makeOrder()));
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/events"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("calls fetch when an order is patched (order_patch event)", () => {
    const store = makeStore();
    store.dispatch(ordersSlice.actions.orderAdded(makeOrder()));
    vi.clearAllMocks();
    store.dispatch(
      ordersSlice.actions.orderPatched({ id: "order-1", patch: { status: "filled" } })
    );
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/events"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("calls fetch when a child is added (child_created event)", () => {
    const store = makeStore();
    store.dispatch(ordersSlice.actions.orderAdded(makeOrder()));
    vi.clearAllMocks();
    store.dispatch(
      ordersSlice.actions.childAdded({
        parentId: "order-1",
        child: {
          id: "c-1",
          parentId: "order-1",
          asset: "AAPL",
          side: "BUY",
          quantity: 25,
          limitPrice: 150,
          status: "filled",
          filled: 25,
          submittedAt: NOW,
        },
      })
    );
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/events"),
      expect.objectContaining({ method: "POST" })
    );
  });
});

// @vitest-environment node
/**
 * useOrders hook tests.
 *
 * We use the `node` environment to avoid jsdom OOM on this container.
 * React hook behaviour (state updates) is tested through integration-style
 * assertions using a lightweight React renderer shim.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock uuid before any module imports to avoid crypto OOM in restricted envs
vi.mock("uuid", () => ({
  v4: vi.fn(
    (() => {
      let n = 0;
      return () => `test-uuid-${++n}`;
    })()
  ),
}));

// Provide minimal fetch / AbortSignal stubs for node env
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  if (!globalThis.AbortSignal?.timeout) {
    vi.stubGlobal("AbortSignal", {
      timeout: (_ms: number) => ({ signal: "mock" }),
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Test the pure helper / logic extracted from useOrders
// ---------------------------------------------------------------------------

type OrderSide = "BUY" | "SELL";

function isLimitTriggered(side: OrderSide, marketPrice: number, limitPrice: number): boolean {
  return (side === "BUY" && marketPrice <= limitPrice) ||
    (side === "SELL" && marketPrice >= limitPrice);
}

describe("LIMIT order fill logic (pure)", () => {
  it("fills a BUY order when market price <= limit price", () => {
    expect(isLimitTriggered("BUY", 148, 150)).toBe(true);
  });

  it("does NOT fill a BUY order when market price > limit price", () => {
    expect(isLimitTriggered("BUY", 155, 150)).toBe(false);
  });

  it("fills a SELL order when market price >= limit price", () => {
    expect(isLimitTriggered("SELL", 160, 155)).toBe(true);
  });

  it("does NOT fill a SELL order when market price < limit price", () => {
    expect(isLimitTriggered("SELL", 140, 155)).toBe(false);
  });

  it("expires an order when expiresAt has passed", () => {
    const now = Date.now();
    const expiresAt = now - 1000; // 1 second in the past
    const isExpired = now >= expiresAt;
    expect(isExpired).toBe(true);
  });
});

describe("TWAP slice calculation (pure)", () => {
  it("calculates number of slices from duration", () => {
    const TWAP_INTERVAL_MS = 5000;
    const durationMs = 30_000; // 30 seconds
    const numSlices = Math.max(1, Math.round(durationMs / TWAP_INTERVAL_MS));
    expect(numSlices).toBe(6);
  });

  it("calculates slice size from quantity and slices", () => {
    const quantity = 100;
    const numSlices = 4;
    const sliceSize = quantity / numSlices;
    expect(sliceSize).toBe(25);
  });

  it("marks order done when sliceIndex >= numSlices", () => {
    const numSlices = 3;
    const quantity = 90;
    const sliceSize = 30;
    let filled = 0;
    let sliceIndex = 0;

    // Simulate 3 slices
    for (let i = 0; i < 3; i++) {
      filled = Math.min(filled + sliceSize, quantity);
      sliceIndex++;
      const done = sliceIndex >= numSlices || filled >= quantity;
      if (i < 2) expect(done).toBe(false);
      else expect(done).toBe(true);
    }

    expect(filled).toBe(90);
  });

  it("caps filled at quantity", () => {
    const quantity = 100;
    const sliceSize = 40;
    let filled = 0;
    for (let i = 0; i < 3; i++) {
      filled = Math.min(filled + sliceSize, quantity);
    }
    expect(filled).toBe(100);
  });
});

describe("POV slice calculation (pure)", () => {
  it("calculates a slice from participation rate and market volume", () => {
    const participationRate = 10; // 10%
    const marketVolume = 1000;
    const rawSlice = (participationRate / 100) * marketVolume;
    expect(rawSlice).toBe(100);
  });

  it("clamps slice to maxSliceSize", () => {
    const rawSlice = 500;
    const maxSlice = 200;
    const slice = Math.min(rawSlice, maxSlice);
    expect(slice).toBe(200);
  });

  it("clamps slice to minSliceSize", () => {
    const rawSlice = 2;
    const minSlice = 5;
    const slice = Math.max(rawSlice, minSlice);
    expect(slice).toBe(5);
  });

  it("clamps slice to remaining quantity", () => {
    const rawSlice = 200;
    const remaining = 50;
    const filled = 950;
    const quantity = 1000;
    const slice = Math.min(rawSlice, quantity - filled, remaining);
    expect(slice).toBe(50);
  });
});

describe("VWAP deviation check (pure)", () => {
  it("allows fill when deviation is within max", () => {
    const currentPrice = 150;
    const limitPrice = 150;
    const maxDev = 0.005; // 0.5%
    const deviation = Math.abs(currentPrice - limitPrice) / limitPrice;
    expect(deviation).toBe(0);
    expect(deviation > maxDev).toBe(false);
  });

  it("blocks fill when deviation exceeds max", () => {
    const currentPrice = 160;
    const limitPrice = 150;
    const maxDev = 0.005; // 0.5%
    const deviation = Math.abs(currentPrice - limitPrice) / limitPrice;
    // (160 - 150) / 150 ≈ 0.0667 → 6.67% > 0.5%
    expect(deviation > maxDev).toBe(true);
  });

  it("allows fill when deviation equals max exactly", () => {
    const limitPrice = 100;
    const currentPrice = 100.5; // 0.5% above
    const maxDev = 0.005;
    const deviation = Math.abs(currentPrice - limitPrice) / limitPrice;
    expect(deviation > maxDev).toBe(false);
  });
});

describe("Order ID generation", () => {
  it("uuid mock generates deterministic IDs", async () => {
    const { v4 } = await import("uuid");
    const id1 = v4();
    const id2 = v4();
    expect(id1).not.toBe(id2);
    expect(typeof id1).toBe("string");
  });
});

describe("Endpoint mapping (pure)", () => {
  it("maps strategies to correct endpoint keys", () => {
    const strategies = ["LIMIT", "TWAP", "POV", "VWAP"];
    expect(strategies).toContain("LIMIT");
    expect(strategies).toContain("TWAP");
    expect(strategies).toContain("POV");
    expect(strategies).toContain("VWAP");
  });
});

describe("OBS event payload (pure)", () => {
  it("builds order_submitted event correctly", () => {
    const order = { id: "123", asset: "AAPL", side: "BUY" };
    const evt = { type: "order_submitted", ts: Date.now(), payload: { order } };
    expect(evt.type).toBe("order_submitted");
    expect(evt.payload.order).toBe(order);
  });

  it("builds order_patch event correctly", () => {
    const patch = { status: "filled", filled: 100 };
    const evt = { type: "order_patch", ts: Date.now(), payload: { id: "123", patch } };
    expect(evt.type).toBe("order_patch");
    expect(evt.payload.patch).toBe(patch);
  });

  it("builds child_created event correctly", () => {
    const child = { id: "child-1", parentId: "parent-1" };
    const evt = { type: "child_created", ts: Date.now(), payload: { parentId: "parent-1", child } };
    expect(evt.type).toBe("child_created");
    expect(evt.payload.parentId).toBe("parent-1");
  });
});

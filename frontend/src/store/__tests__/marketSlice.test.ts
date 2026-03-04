import { describe, expect, it } from "vitest";
import type { OhlcCandle } from "../../types";
import {
  applyTick,
  applyTickMut,
  bucketStart,
  candlesSeeded,
  type MarketState,
  marketSlice,
  orderBookUpdated,
  setAssets,
  tickReceived,
} from "../marketSlice";

const { reducer } = marketSlice;

const initialState = {
  assets: [],
  prices: {},
  priceHistory: {},
  candleHistory: {},
  candlesReady: {},
  orderBook: {},
  connected: false,
};

// ─── bucketStart ─────────────────────────────────────────────────────────────

describe("bucketStart", () => {
  it("floors a timestamp to the start of its 1-minute bucket", () => {
    // 1_700_000_040_000 is on a 60s boundary; add 25s to be mid-bucket
    const boundary = 1_700_000_040_000;
    const ts = boundary + 25_000;
    const bucket = bucketStart(ts, 60_000);
    expect(bucket % 60_000).toBe(0);
    expect(bucket).toBeLessThanOrEqual(ts);
    expect(bucket + 60_000).toBeGreaterThan(ts);
  });

  it("returns the exact timestamp when it is already on a boundary", () => {
    // 1_700_000_040_000 is confirmed to be on a 60s boundary (% 60000 === 0)
    const ts = 1_700_000_040_000;
    expect(bucketStart(ts, 60_000)).toBe(ts);
  });

  it("floors to 5-minute bucket", () => {
    // Find a 5m-aligned timestamp and add 130s
    const boundary = Math.floor(1_700_000_040_000 / 300_000) * 300_000;
    const ts = boundary + 130_000;
    const bucket = bucketStart(ts, 300_000);
    expect(bucket % 300_000).toBe(0);
    expect(bucket + 300_000).toBeGreaterThan(ts);
  });

  it("handles ts = 0", () => {
    expect(bucketStart(0, 60_000)).toBe(0);
  });
});

// ─── applyTick ────────────────────────────────────────────────────────────────

describe("applyTick – same bucket", () => {
  // 1_700_000_040_000 is confirmed on a 60s boundary (% 60_000 === 0)
  const BUCKET_TS = 1_700_000_040_000;
  const base: OhlcCandle = {
    time: BUCKET_TS,
    open: 100,
    high: 105,
    low: 98,
    close: 102,
    volume: 50,
  };

  it("updates close to the new price", () => {
    const result = applyTick([base], 110, BUCKET_TS + 5_000, 60_000, 20);
    expect(result[0].close).toBe(110);
  });

  it("updates high when new price exceeds current high", () => {
    const result = applyTick([base], 110, BUCKET_TS + 5_000, 60_000, 0);
    expect(result[0].high).toBe(110);
  });

  it("does not lower high when price is below current high", () => {
    const result = applyTick([base], 100, BUCKET_TS + 5_000, 60_000, 0);
    expect(result[0].high).toBe(105);
  });

  it("updates low when new price is below current low", () => {
    const result = applyTick([base], 90, BUCKET_TS + 5_000, 60_000, 0);
    expect(result[0].low).toBe(90);
  });

  it("does not raise low when price is above current low", () => {
    const result = applyTick([base], 100, BUCKET_TS + 5_000, 60_000, 0);
    expect(result[0].low).toBe(98);
  });

  it("accumulates volume", () => {
    const result = applyTick([base], 102, BUCKET_TS + 5_000, 60_000, 30);
    expect(result[0].volume).toBe(80);
  });

  it("preserves open", () => {
    const result = applyTick([base], 110, BUCKET_TS + 5_000, 60_000, 0);
    expect(result[0].open).toBe(100);
  });

  it("returns array of same length", () => {
    const result = applyTick([base], 110, BUCKET_TS + 5_000, 60_000, 0);
    expect(result).toHaveLength(1);
  });
});

describe("applyTick – new bucket", () => {
  const BUCKET_TS = 1_700_000_040_000; // confirmed on 60s boundary
  const candle: OhlcCandle = {
    time: BUCKET_TS,
    open: 100,
    high: 105,
    low: 98,
    close: 102,
    volume: 50,
  };
  const nextBucketTs = BUCKET_TS + 60_000; // next 1m boundary

  it("creates a new candle for a new bucket", () => {
    const result = applyTick([candle], 110, nextBucketTs + 1_000, 60_000, 40);
    expect(result).toHaveLength(2);
    expect(result[1].open).toBe(110);
    expect(result[1].close).toBe(110);
    expect(result[1].high).toBe(110);
    expect(result[1].low).toBe(110);
    expect(result[1].volume).toBe(40);
  });

  it("new candle time is aligned to bucket boundary", () => {
    const result = applyTick([candle], 110, nextBucketTs + 15_000, 60_000, 0);
    expect(result[1].time).toBe(nextBucketTs);
  });

  it("preserves existing candle when a new one is added", () => {
    const result = applyTick([candle], 110, nextBucketTs, 60_000, 0);
    expect(result[0]).toEqual(candle);
  });
});

describe("applyTick – empty candles array", () => {
  it("creates the first candle", () => {
    const result = applyTick([], 150, 1_700_000_000_000, 60_000, 100);
    expect(result).toHaveLength(1);
    expect(result[0].open).toBe(150);
    expect(result[0].close).toBe(150);
    expect(result[0].volume).toBe(100);
  });
});

describe("applyTick – MAX_CANDLES cap", () => {
  it("caps the array at 120 candles", () => {
    // Build 120 candles each in their own bucket
    let candles: OhlcCandle[] = [];
    const baseTs = 1_700_000_000_000;
    for (let i = 0; i < 120; i++) {
      candles = applyTick(candles, 100 + i, baseTs + i * 60_000, 60_000, 1);
    }
    expect(candles).toHaveLength(120);

    // Adding a 121st bucket should drop the oldest
    const result = applyTick(candles, 999, baseTs + 120 * 60_000, 60_000, 1);
    expect(result).toHaveLength(120);
    expect(result[result.length - 1].close).toBe(999);
  });
});

// ─── setAssets reducer ────────────────────────────────────────────────────────

describe("setAssets", () => {
  it("populates assets array", () => {
    const action = setAssets([
      { symbol: "AAPL", initialPrice: 150, volatility: 0.02, sector: "Technology" },
    ]);
    const state = reducer(initialState, action);
    expect(state.assets).toHaveLength(1);
    expect(state.assets[0].symbol).toBe("AAPL");
  });

  it("initializes empty priceHistory for each asset", () => {
    const action = setAssets([
      { symbol: "AAPL", initialPrice: 150, volatility: 0.02, sector: "Technology" },
      { symbol: "MSFT", initialPrice: 300, volatility: 0.015, sector: "Technology" },
    ]);
    const state = reducer(initialState, action);
    expect(state.priceHistory.AAPL).toEqual([]);
    expect(state.priceHistory.MSFT).toEqual([]);
  });

  it("initializes empty candleHistory buckets for each asset", () => {
    const action = setAssets([
      { symbol: "AAPL", initialPrice: 150, volatility: 0.02, sector: "Technology" },
    ]);
    const state = reducer(initialState, action);
    expect(state.candleHistory.AAPL).toEqual({ "1m": [], "5m": [] });
  });

  it("does not overwrite existing priceHistory when called twice", () => {
    const action1 = setAssets([
      { symbol: "AAPL", initialPrice: 150, volatility: 0.02, sector: "Technology" },
    ]);
    const stateAfterFirst = reducer(initialState, action1);

    // Simulate some price history
    const withHistory = {
      ...stateAfterFirst,
      priceHistory: { AAPL: [148, 149, 150] },
    };

    // setAssets again with same symbol
    const action2 = setAssets([
      { symbol: "AAPL", initialPrice: 150, volatility: 0.02, sector: "Technology" },
    ]);
    const state = reducer(withHistory, action2);
    // ??= means it does NOT overwrite existing
    expect(state.priceHistory.AAPL).toEqual([148, 149, 150]);
  });
});

// ─── tickReceived reducer ─────────────────────────────────────────────────────

describe("tickReceived", () => {
  const baseState = {
    ...initialState,
    assets: [{ symbol: "AAPL", initialPrice: 150, volatility: 0.02, sector: "Technology" }],
    priceHistory: { AAPL: [] },
    candleHistory: { AAPL: { "1m": [], "5m": [] } },
  };

  it("updates prices", () => {
    const action = tickReceived({ prices: { AAPL: 155 }, ts: 1_700_000_000_000 });
    const state = reducer(baseState, action);
    expect(state.prices.AAPL).toBe(155);
  });

  it("appends to priceHistory", () => {
    const action = tickReceived({ prices: { AAPL: 155 }, ts: 1_700_000_000_000 });
    const state = reducer(baseState, action);
    expect(state.priceHistory.AAPL).toEqual([155]);
  });

  it("caps priceHistory at 60 entries", () => {
    let state: MarketState = {
      ...baseState,
      priceHistory: { AAPL: [] },
      candleHistory: { AAPL: { "1m": [], "5m": [] } },
    };
    for (let i = 0; i < 65; i++) {
      state = reducer(
        state,
        tickReceived({ prices: { AAPL: 100 + i }, ts: 1_700_000_000_000 + i * 1_000 })
      );
    }
    expect(state.priceHistory.AAPL).toHaveLength(60);
    // Most recent price is the last one pushed
    expect(state.priceHistory.AAPL[59]).toBe(164);
  });

  it("creates OHLC candles for both intervals", () => {
    const ts = 1_700_000_060_000;
    const action = tickReceived({ prices: { AAPL: 155 }, ts });
    const state = reducer(baseState, action);
    expect(state.candleHistory.AAPL["1m"]).toHaveLength(1);
    expect(state.candleHistory.AAPL["5m"]).toHaveLength(1);
  });

  it("accumulates volume in candles from volumes payload", () => {
    // volumes from market-sim are per-minute figures divided by TICKS_PER_MINUTE (240)
    // so two ticks with volumes 1000 and 500 produce 1000/240 + 500/240 ≈ 6.25
    const TICKS_PER_MINUTE = 240;
    const ts = 1_700_000_060_000;
    let state = reducer(
      baseState,
      tickReceived({ prices: { AAPL: 155 }, volumes: { AAPL: 1000 }, ts })
    );
    state = reducer(
      state,
      tickReceived({ prices: { AAPL: 156 }, volumes: { AAPL: 500 }, ts: ts + 10_000 })
    );
    const expected = 1000 / TICKS_PER_MINUTE + 500 / TICKS_PER_MINUTE;
    expect(state.candleHistory.AAPL["1m"][0].volume).toBeCloseTo(expected, 5);
  });

  it("creates a new candle when crossing a bucket boundary", () => {
    const ts1 = 1_700_000_000_000;
    const ts2 = ts1 + 60_000; // next 1m bucket
    let state = reducer(baseState, tickReceived({ prices: { AAPL: 155 }, ts: ts1 }));
    state = reducer(state, tickReceived({ prices: { AAPL: 160 }, ts: ts2 }));
    expect(state.candleHistory.AAPL["1m"]).toHaveLength(2);
  });

  it("handles multiple assets in one tick", () => {
    const stateWithTwo = {
      ...initialState,
      priceHistory: { AAPL: [], MSFT: [] },
      candleHistory: { AAPL: { "1m": [], "5m": [] }, MSFT: { "1m": [], "5m": [] } },
    };
    const action = tickReceived({
      prices: { AAPL: 155, MSFT: 320 },
      ts: 1_700_000_000_000,
    });
    const state = reducer(stateWithTwo, action);
    expect(state.prices.AAPL).toBe(155);
    expect(state.prices.MSFT).toBe(320);
  });
});

// ─── applyTickMut ─────────────────────────────────────────────────────────────

describe("applyTickMut", () => {
  const bucket = 1_700_000_040_000; // 60s-aligned
  const INTERVAL_1M = 60_000;

  it("creates a new candle when array is empty", () => {
    const candles: OhlcCandle[] = [];
    applyTickMut(candles, 100, bucket + 5_000, INTERVAL_1M);
    expect(candles).toHaveLength(1);
    expect(candles[0]).toMatchObject({ time: bucket, open: 100, high: 100, low: 100, close: 100 });
  });

  it("updates high/low/close of the current candle in-place", () => {
    const candles: OhlcCandle[] = [{ time: bucket, open: 100, high: 100, low: 100, close: 100 }];
    applyTickMut(candles, 105, bucket + 10_000, INTERVAL_1M);
    expect(candles).toHaveLength(1);
    expect(candles[0].high).toBe(105);
    expect(candles[0].close).toBe(105);
    expect(candles[0].open).toBe(100); // unchanged

    applyTickMut(candles, 98, bucket + 20_000, INTERVAL_1M);
    expect(candles[0].low).toBe(98);
    expect(candles[0].high).toBe(105); // unchanged
  });

  it("accumulates volume", () => {
    const candles: OhlcCandle[] = [
      { time: bucket, open: 100, high: 100, low: 100, close: 100, volume: 10 },
    ];
    applyTickMut(candles, 101, bucket + 5_000, INTERVAL_1M, 5);
    expect(candles[0].volume).toBe(15);
  });

  it("opens a new candle when crossing a bucket boundary", () => {
    const nextBucket = bucket + INTERVAL_1M;
    const candles: OhlcCandle[] = [{ time: bucket, open: 100, high: 110, low: 90, close: 105 }];
    applyTickMut(candles, 108, nextBucket + 1_000, INTERVAL_1M);
    expect(candles).toHaveLength(2);
    expect(candles[1].time).toBe(nextBucket);
    expect(candles[1].open).toBe(108);
  });

  it("trims to MAX_CANDLES (120) when exceeded", () => {
    const candles: OhlcCandle[] = [];
    for (let i = 0; i < 121; i++) {
      const t = bucket + i * INTERVAL_1M;
      applyTickMut(candles, 100 + i, t, INTERVAL_1M);
    }
    expect(candles.length).toBeLessThanOrEqual(120);
  });
});

// ─── candlesSeeded reducer ────────────────────────────────────────────────────

describe("candlesSeeded", () => {
  const bucket = 1_700_000_040_000;
  const serverCandles1m: OhlcCandle[] = [
    { time: bucket, open: 100, high: 110, low: 90, close: 105 },
    { time: bucket + 60_000, open: 105, high: 115, low: 100, close: 112 },
  ];
  const serverCandles5m: OhlcCandle[] = [
    { time: bucket, open: 100, high: 120, low: 90, close: 112 },
  ];

  it("sets candlesReady[symbol] to true", () => {
    const state = reducer(
      { ...initialState, candleHistory: { AAPL: { "1m": [], "5m": [] } } },
      candlesSeeded({ symbol: "AAPL", candles: { "1m": serverCandles1m, "5m": serverCandles5m } })
    );
    expect(state.candlesReady.AAPL).toBe(true);
  });

  it("replaces candleHistory with server candles when no live ticks are newer", () => {
    const state = reducer(
      { ...initialState, candleHistory: { AAPL: { "1m": [], "5m": [] } } },
      candlesSeeded({ symbol: "AAPL", candles: { "1m": serverCandles1m, "5m": serverCandles5m } })
    );
    expect(state.candleHistory.AAPL["1m"]).toHaveLength(2);
    expect(state.candleHistory.AAPL["1m"][0].close).toBe(105);
  });

  it("merges live ticks newer than last server bar", () => {
    const liveCandle: OhlcCandle = {
      time: bucket + 120_000, // newer than last server bar at bucket+60_000
      open: 112,
      high: 120,
      low: 110,
      close: 118,
    };
    const stateWithLive = {
      ...initialState,
      candleHistory: { AAPL: { "1m": [liveCandle], "5m": [] } },
    };
    const state = reducer(
      stateWithLive,
      candlesSeeded({ symbol: "AAPL", candles: { "1m": serverCandles1m, "5m": [] } })
    );
    // Should have 2 server bars + 1 live bar
    expect(state.candleHistory.AAPL["1m"]).toHaveLength(3);
    expect(state.candleHistory.AAPL["1m"][2].time).toBe(bucket + 120_000);
  });

  it("excludes live ticks that overlap with server bars", () => {
    const overlappingLive: OhlcCandle = {
      time: bucket + 60_000, // same time as last server bar — should be excluded
      open: 999,
      high: 999,
      low: 999,
      close: 999,
    };
    const stateWithLive = {
      ...initialState,
      candleHistory: { AAPL: { "1m": [overlappingLive], "5m": [] } },
    };
    const state = reducer(
      stateWithLive,
      candlesSeeded({ symbol: "AAPL", candles: { "1m": serverCandles1m, "5m": [] } })
    );
    expect(state.candleHistory.AAPL["1m"]).toHaveLength(2);
    expect(state.candleHistory.AAPL["1m"][1].close).toBe(112); // server value wins
  });

  it("falls back to live ticks when server returns empty candles", () => {
    const liveTick: OhlcCandle = { time: bucket, open: 50, high: 60, low: 45, close: 55 };
    const stateWithLive = {
      ...initialState,
      candleHistory: { AAPL: { "1m": [liveTick], "5m": [] } },
    };
    const state = reducer(
      stateWithLive,
      candlesSeeded({ symbol: "AAPL", candles: { "1m": [], "5m": [] } })
    );
    expect(state.candleHistory.AAPL["1m"]).toEqual([liveTick]);
  });
});

// ─── setAssets — candlesReady pre-marking ─────────────────────────────────────

describe("setAssets candlesReady", () => {
  it("pre-marks candlesReady[symbol] = true so chart renders before candle-store fetch", () => {
    const action = setAssets([
      { symbol: "AAPL", initialPrice: 150, volatility: 0.02, sector: "Technology" },
    ]);
    const state = reducer(initialState, action);
    expect(state.candlesReady.AAPL).toBe(true);
  });

  it("does not overwrite candlesReady already set (idempotent)", () => {
    const action1 = setAssets([
      { symbol: "AAPL", initialPrice: 150, volatility: 0.02, sector: "Technology" },
    ]);
    const state1 = reducer(initialState, action1);
    // Simulate candlesSeeded setting it true (already true in our case)
    const action2 = setAssets([
      { symbol: "AAPL", initialPrice: 150, volatility: 0.02, sector: "Technology" },
      { symbol: "MSFT", initialPrice: 300, volatility: 0.015, sector: "Technology" },
    ]);
    const state2 = reducer(state1, action2);
    expect(state2.candlesReady.AAPL).toBe(true);
    expect(state2.candlesReady.MSFT).toBe(true);
  });
});

// ─── orderBookUpdated reducer ─────────────────────────────────────────────────

describe("orderBookUpdated", () => {
  it("replaces orderBook state", () => {
    const snapshot = {
      AAPL: {
        bids: [{ price: 149.9, size: 100 }],
        asks: [{ price: 150.1, size: 80 }],
        mid: 150,
        ts: 1_700_000_000_000,
      },
    };
    const action = orderBookUpdated(snapshot);
    const state = reducer(initialState, action);
    expect(state.orderBook.AAPL).toEqual(snapshot.AAPL);
  });

  it("overwrites previous orderBook entirely", () => {
    const first = {
      AAPL: { bids: [], asks: [], mid: 150, ts: 1_000 },
      MSFT: { bids: [], asks: [], mid: 300, ts: 1_000 },
    };
    const stateWithBook = reducer(initialState, orderBookUpdated(first));
    const second = {
      AAPL: { bids: [], asks: [], mid: 151, ts: 2_000 },
    };
    const state = reducer(stateWithBook, orderBookUpdated(second));
    expect(state.orderBook.MSFT).toBeUndefined();
    expect(state.orderBook.AAPL.mid).toBe(151);
  });
});

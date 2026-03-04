import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";
import type {
  AssetDef,
  CandleHistory,
  MarketPrices,
  OhlcCandle,
  OrderBookSnapshot,
  PriceHistory,
} from "../types.ts";

const HISTORY_LENGTH = 60;
const MAX_CANDLES = 120;
// Market-sim broadcasts per-minute volume on every tick (240 ticks/min).
// Divide by this to get per-tick volume so candle volumes match the candle-store.
const TICKS_PER_MINUTE = 240;
const INTERVALS: { key: "1m" | "5m"; ms: number }[] = [
  { key: "1m", ms: 60_000 },
  { key: "5m", ms: 300_000 },
];

export function bucketStart(ts: number, intervalMs: number): number {
  return Math.floor(ts / intervalMs) * intervalMs;
}

export function applyTick(
  candles: OhlcCandle[],
  price: number,
  ts: number,
  intervalMs: number,
  tickVolume = 0
): OhlcCandle[] {
  const bucket = bucketStart(ts, intervalMs);
  const last = candles[candles.length - 1];
  if (last && last.time === bucket) {
    const updated: OhlcCandle = {
      ...last,
      high: Math.max(last.high, price),
      low: Math.min(last.low, price),
      close: price,
      volume: (last.volume ?? 0) + tickVolume,
    };
    return [...candles.slice(0, -1), updated];
  }
  const newCandle: OhlcCandle = {
    time: bucket,
    open: price,
    high: price,
    low: price,
    close: price,
    volume: tickVolume,
  };
  return [...candles, newCandle].slice(-MAX_CANDLES);
}

/** Immer-safe in-place mutation of a candle array. No allocations for the common case. */
export function applyTickMut(
  candles: OhlcCandle[],
  price: number,
  ts: number,
  intervalMs: number,
  tickVolume = 0
): void {
  const bucket = bucketStart(ts, intervalMs);
  const last = candles.length > 0 ? candles[candles.length - 1] : undefined;
  if (last && last.time === bucket) {
    if (price > last.high) last.high = price;
    if (price < last.low) last.low = price;
    last.close = price;
    last.volume = (last.volume ?? 0) + tickVolume;
  } else {
    candles.push({
      time: bucket,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: tickVolume,
    });
    if (candles.length > MAX_CANDLES) candles.splice(0, candles.length - MAX_CANDLES);
  }
}

export interface MarketState {
  assets: AssetDef[];
  prices: MarketPrices;
  priceHistory: PriceHistory;
  candleHistory: CandleHistory;
  candlesReady: Record<string, boolean>;
  orderBook: Record<string, OrderBookSnapshot>;
  connected: boolean;
}

const initialState: MarketState = {
  assets: [],
  prices: {},
  priceHistory: {},
  candleHistory: {},
  candlesReady: {},
  orderBook: {},
  connected: false,
};

export const marketSlice = createSlice({
  name: "market",
  initialState,
  reducers: {
    setAssets(state, action: PayloadAction<AssetDef[]>) {
      state.assets = action.payload;
      for (const a of action.payload) {
        state.priceHistory[a.symbol] ??= [];
        state.candleHistory[a.symbol] ??= { "1m": [], "5m": [] };
        // Pre-mark ready so the chart renders from live ticks immediately;
        // candlesSeeded will overwrite candleHistory with server history once
        // the candle-store fetch completes.
        state.candlesReady[a.symbol] ??= true;
      }
    },
    setConnected(state, action: PayloadAction<boolean>) {
      state.connected = action.payload;
    },
    tickReceived(
      state,
      action: PayloadAction<{ prices: MarketPrices; volumes?: Record<string, number>; ts: number }>
    ) {
      const { prices, volumes = {}, ts } = action.payload;
      state.prices = prices;
      for (const asset of Object.keys(prices)) {
        const price = prices[asset];
        const tickVolume = (volumes[asset] ?? 0) / TICKS_PER_MINUTE;

        // priceHistory: mutate in place via Immer (no spread/slice allocation)
        const hist = state.priceHistory[asset] ?? [];
        state.priceHistory[asset] = hist; // ensure initialised
        hist.push(price);
        if (hist.length > HISTORY_LENGTH) hist.splice(0, hist.length - HISTORY_LENGTH);

        // candleHistory: mutate in place via Immer
        if (!state.candleHistory[asset]) {
          state.candleHistory[asset] = { "1m": [], "5m": [] };
        }
        for (const { key, ms } of INTERVALS) {
          applyTickMut(state.candleHistory[asset][key], price, ts, ms, tickVolume);
        }
      }
    },
    candlesSeeded(
      state,
      action: PayloadAction<{ symbol: string; candles: { "1m": OhlcCandle[]; "5m": OhlcCandle[] } }>
    ) {
      const { symbol, candles } = action.payload;
      // Merge: start from server history, then re-apply any live ticks newer than the last server bar
      const live = state.candleHistory[symbol] ?? { "1m": [], "5m": [] };
      const merged: { "1m": OhlcCandle[]; "5m": OhlcCandle[] } = { "1m": [], "5m": [] };
      for (const key of ["1m", "5m"] as const) {
        const serverBars = candles[key];
        const liveBars = live[key];
        if (serverBars.length === 0) {
          merged[key] = liveBars;
        } else {
          const lastServerTime = serverBars[serverBars.length - 1].time;
          // Keep live bars strictly newer than the last server bar (avoids duplicates)
          const newerLive = liveBars.filter((c) => c.time > lastServerTime);
          merged[key] = [...serverBars, ...newerLive].slice(-MAX_CANDLES);
        }
      }
      state.candleHistory[symbol] = merged;
      state.candlesReady[symbol] = true;
    },
    orderBookUpdated(state, action: PayloadAction<Record<string, OrderBookSnapshot>>) {
      state.orderBook = action.payload;
    },
  },
});

export const { setAssets, setConnected, tickReceived, candlesSeeded, orderBookUpdated } =
  marketSlice.actions;

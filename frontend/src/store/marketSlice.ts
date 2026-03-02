import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";
import type { AssetDef, CandleHistory, MarketPrices, OhlcCandle, PriceHistory } from "../types.ts";

const HISTORY_LENGTH = 60;
const MAX_CANDLES = 120;
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
  intervalMs: number
): OhlcCandle[] {
  const bucket = bucketStart(ts, intervalMs);
  const last = candles[candles.length - 1];
  if (last && last.time === bucket) {
    const updated: OhlcCandle = {
      ...last,
      high: Math.max(last.high, price),
      low: Math.min(last.low, price),
      close: price,
    };
    return [...candles.slice(0, -1), updated];
  }
  const newCandle: OhlcCandle = {
    time: bucket,
    open: price,
    high: price,
    low: price,
    close: price,
  };
  return [...candles, newCandle].slice(-MAX_CANDLES);
}

interface MarketState {
  assets: AssetDef[];
  prices: MarketPrices;
  priceHistory: PriceHistory;
  candleHistory: CandleHistory;
  connected: boolean;
}

const initialState: MarketState = {
  assets: [],
  prices: {},
  priceHistory: {},
  candleHistory: {},
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
      }
    },
    setConnected(state, action: PayloadAction<boolean>) {
      state.connected = action.payload;
    },
    tickReceived(state, action: PayloadAction<{ prices: MarketPrices; ts: number }>) {
      const { prices, ts } = action.payload;
      state.prices = prices;
      for (const asset of Object.keys(prices)) {
        const price = prices[asset];
        const history = state.priceHistory[asset] ?? [];
        state.priceHistory[asset] = [...history, price].slice(-HISTORY_LENGTH);
        const current = state.candleHistory[asset] ?? { "1m": [], "5m": [] };
        const updated = { ...current };
        for (const { key, ms } of INTERVALS) {
          updated[key] = applyTick(current[key], price, ts, ms);
        }
        state.candleHistory[asset] = updated;
      }
    },
  },
});

export const { setAssets, setConnected, tickReceived } = marketSlice.actions;

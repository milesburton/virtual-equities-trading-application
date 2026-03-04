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
        const history = state.priceHistory[asset] ?? [];
        state.priceHistory[asset] = [...history, price].slice(-HISTORY_LENGTH);
        const current = state.candleHistory[asset] ?? { "1m": [], "5m": [] };
        const updated = { ...current };
        for (const { key, ms } of INTERVALS) {
          updated[key] = applyTick(current[key], price, ts, ms, tickVolume);
        }
        state.candleHistory[asset] = updated;
      }
    },
    candlesSeeded(
      state,
      action: PayloadAction<{ symbol: string; candles: { "1m": OhlcCandle[]; "5m": OhlcCandle[] } }>
    ) {
      const { symbol, candles } = action.payload;
      state.candleHistory[symbol] = candles;
      state.candlesReady[symbol] = true;
    },
    orderBookUpdated(state, action: PayloadAction<Record<string, OrderBookSnapshot>>) {
      state.orderBook = action.payload;
    },
  },
});

export const { setAssets, setConnected, tickReceived, candlesSeeded, orderBookUpdated } =
  marketSlice.actions;

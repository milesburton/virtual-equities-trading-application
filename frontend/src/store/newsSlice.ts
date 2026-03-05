import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";
import type { RootState } from "./index.ts";

export interface NewsItem {
  id: string;
  symbol: string;
  headline: string;
  source: string;
  url: string;
  publishedAt: number;
  sentiment: "positive" | "negative" | "neutral";
  sentimentScore: number;
  relatedSymbols: string[];
}

interface NewsState {
  bySymbol: Record<string, NewsItem[]>; // newest first, capped at MAX_PER_SYMBOL
}

const MAX_PER_SYMBOL = 50;

const initialState: NewsState = { bySymbol: {} };

export const newsSlice = createSlice({
  name: "news",
  initialState,
  reducers: {
    newsItemReceived(state, action: PayloadAction<NewsItem>) {
      const { symbol } = action.payload;
      const list = state.bySymbol[symbol] ?? [];
      // Deduplicate by id
      if (list.some((i) => i.id === action.payload.id)) return;
      list.unshift(action.payload);
      if (list.length > MAX_PER_SYMBOL) list.length = MAX_PER_SYMBOL;
      state.bySymbol[symbol] = list;
    },
    newsBatchReceived(state, action: PayloadAction<NewsItem[]>) {
      for (const item of action.payload) {
        const { symbol } = item;
        const list = state.bySymbol[symbol] ?? [];
        if (!list.some((i) => i.id === item.id)) {
          list.push(item);
        }
        state.bySymbol[symbol] = list;
      }
      // Sort descending and cap
      for (const symbol of Object.keys(state.bySymbol)) {
        state.bySymbol[symbol].sort((a, b) => b.publishedAt - a.publishedAt);
        if (state.bySymbol[symbol].length > MAX_PER_SYMBOL) {
          state.bySymbol[symbol].length = MAX_PER_SYMBOL;
        }
      }
    },
  },
});

export const { newsItemReceived, newsBatchReceived } = newsSlice.actions;

export function selectNewsForSymbol(state: RootState, symbol: string | null): NewsItem[] {
  if (!symbol) return [];
  return state.news.bySymbol[symbol] ?? [];
}

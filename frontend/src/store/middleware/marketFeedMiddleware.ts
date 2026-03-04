import type { Middleware } from "@reduxjs/toolkit";
import type {
  AssetDef,
  MarketPrices,
  OhlcCandle,
  OrderBookSnapshot,
  OrderRecord,
} from "../../types.ts";
import { candlesSeeded, marketSlice, orderBookUpdated } from "../marketSlice.ts";
import { orderAdded } from "../ordersSlice.ts";
import { setSelectedAsset } from "../uiSlice.ts";

// Derive base URLs from the current origin so the app works behind Traefik
// without any environment variables. VITE_* overrides remain available for
// non-standard deployments (separate hosts, custom ports, etc).
const _origin = typeof window !== "undefined" ? window.location.origin : "";
const _wsOrigin = _origin.replace(/^http/, "ws");
const MARKET_WS_URL = import.meta.env.VITE_MARKET_WS_URL ?? `${_wsOrigin}/ws/market-sim`;
const MARKET_HTTP_URL = import.meta.env.VITE_MARKET_HTTP_URL ?? `${_origin}/api/market-sim`;
const CANDLE_STORE_URL = import.meta.env.VITE_CANDLE_STORE_URL ?? `${_origin}/api/candle-store`;
const JOURNAL_URL = import.meta.env.VITE_JOURNAL_URL ?? `${_origin}/api/journal`;

// UI throttle: batch ticks and dispatch to Redux at most 4 times per second.
// The candle-store accumulates full-rate data server-side; the UI only needs
// ~4 renders/s to look smooth. This halves React render work vs raw 4/s ticks.
const UI_TICK_INTERVAL_MS = 250;

export const marketFeedMiddleware: Middleware = (storeAPI) => {
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let started = false;

  // Tick batching state
  let pendingPrices: MarketPrices | null = null;
  let pendingVolumes: Record<string, number> = {};
  let pendingOrderBook: Record<string, OrderBookSnapshot> | null = null;
  let tickTimer: ReturnType<typeof setTimeout> | null = null;

  function flushTick() {
    tickTimer = null;
    if (!pendingPrices) return;
    storeAPI.dispatch(
      marketSlice.actions.tickReceived({
        prices: pendingPrices,
        volumes: pendingVolumes,
        ts: Date.now(),
      })
    );
    if (pendingOrderBook) storeAPI.dispatch(orderBookUpdated(pendingOrderBook));
    pendingPrices = null;
    pendingVolumes = {};
    pendingOrderBook = null;
  }

  function connect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    ws = new WebSocket(MARKET_WS_URL);

    ws.onopen = () => {
      storeAPI.dispatch(marketSlice.actions.setConnected(true));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as {
          event: string;
          data:
            | MarketPrices
            | {
                prices: MarketPrices;
                volumes: Record<string, number>;
                marketMinute: number;
                orderBook?: Record<string, OrderBookSnapshot>;
              };
        };
        const data = msg.data;
        const hasEnvelope = data !== null && typeof data === "object" && "prices" in data;
        const newPrices: MarketPrices = hasEnvelope
          ? (data as { prices: MarketPrices }).prices
          : (data as MarketPrices);
        const volumes: Record<string, number> = hasEnvelope
          ? ((data as { volumes?: Record<string, number> }).volumes ?? {})
          : {};

        // Accumulate — last prices win, volumes accumulate
        pendingPrices = newPrices;
        for (const [sym, vol] of Object.entries(volumes)) {
          pendingVolumes[sym] = (pendingVolumes[sym] ?? 0) + vol;
        }
        if (hasEnvelope) {
          const ob = (data as { orderBook?: Record<string, OrderBookSnapshot> }).orderBook;
          if (ob) pendingOrderBook = ob;
        }

        // Schedule a single flush if not already pending
        if (!tickTimer) {
          tickTimer = setTimeout(flushTick, UI_TICK_INTERVAL_MS);
        }
      } catch {
        // unparseable frame — discard
      }
    };

    ws.onclose = () => {
      if (tickTimer) {
        clearTimeout(tickTimer);
        tickTimer = null;
      }
      storeAPI.dispatch(marketSlice.actions.setConnected(false));
      reconnectTimer = setTimeout(connect, 2000);
    };

    ws.onerror = () => ws?.close();
  }

  async function fetchCandlesForAsset(symbol: string) {
    try {
      const [res1m, res5m] = await Promise.all([
        fetch(`${CANDLE_STORE_URL}/candles?instrument=${symbol}&interval=1m&limit=120`),
        fetch(`${CANDLE_STORE_URL}/candles?instrument=${symbol}&interval=5m&limit=120`),
      ]);
      const candles1m: OhlcCandle[] = res1m.ok ? await res1m.json() : [];
      const candles5m: OhlcCandle[] = res5m.ok ? await res5m.json() : [];
      storeAPI.dispatch(candlesSeeded({ symbol, candles: { "1m": candles1m, "5m": candles5m } }));
    } catch {
      // candle-store unavailable — mark ready so chart renders from live ticks
      storeAPI.dispatch(candlesSeeded({ symbol, candles: { "1m": [], "5m": [] } }));
    }
  }

  async function fetchAssetsAndSeedCandles() {
    try {
      const r = await fetch(`${MARKET_HTTP_URL}/assets`);
      const data: AssetDef[] = await r.json();
      storeAPI.dispatch(marketSlice.actions.setAssets(data));

      if (data.length === 0) return;

      // Auto-select the first asset so the chart and depth panels
      // pre-populate without requiring the user to click in Market Ladder.
      storeAPI.dispatch(setSelectedAsset(data[0].symbol));

      // Seed the first asset immediately so the chart populates right away,
      // then trickle-fetch the rest with a small delay between each to avoid
      // hammering the candle-store with 50 concurrent requests.
      await fetchCandlesForAsset(data[0].symbol);

      for (let i = 1; i < data.length; i++) {
        await new Promise((res) => setTimeout(res, 50));
        fetchCandlesForAsset(data[i].symbol); // fire-and-forget
      }
    } catch {
      // assets unavailable
    }
  }

  async function hydrateOrders() {
    try {
      const res = await fetch(`${JOURNAL_URL}/orders?limit=200`, { credentials: "include" });
      if (!res.ok) return;
      const orders: OrderRecord[] = await res.json();
      // Add oldest-first so the blotter shows newest at top (orderAdded unshifts)
      for (const order of [...orders].reverse()) {
        storeAPI.dispatch(orderAdded(order));
      }
    } catch {
      // journal unavailable — orders start empty
    }
  }

  // Start fetching assets and connecting to market feed immediately
  // This is the initialization that happens on app load
  if (!started) {
    started = true;
    hydrateOrders();
    fetchAssetsAndSeedCandles();
    connect();
  }

  return (next) => (action: unknown) => {
    if ((action as { type: string }).type === "marketFeed/stop") {
      ws?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    }
    return next(action);
  };
};

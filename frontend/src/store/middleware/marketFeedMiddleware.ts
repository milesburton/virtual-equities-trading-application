import type { Middleware } from "@reduxjs/toolkit";
import type { AssetDef, MarketPrices, OhlcCandle, OrderBookSnapshot } from "../../types.ts";
import { candlesSeeded, marketSlice, orderBookUpdated } from "../marketSlice.ts";

// Derive base URLs from the current origin so the app works behind Traefik
// without any environment variables. VITE_* overrides remain available for
// non-standard deployments (separate hosts, custom ports, etc).
const _origin = typeof window !== "undefined" ? window.location.origin : "";
const _wsOrigin = _origin.replace(/^http/, "ws");
const MARKET_WS_URL = import.meta.env.VITE_MARKET_WS_URL ?? `${_wsOrigin}/ws/market-sim`;
const MARKET_HTTP_URL = import.meta.env.VITE_MARKET_HTTP_URL ?? `${_origin}/api/market-sim`;
const CANDLE_STORE_URL = import.meta.env.VITE_CANDLE_STORE_URL ?? `${_origin}/api/candle-store`;

export const marketFeedMiddleware: Middleware = (storeAPI) => {
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let started = false;

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
        storeAPI.dispatch(
          marketSlice.actions.tickReceived({ prices: newPrices, volumes, ts: Date.now() })
        );
        if (hasEnvelope) {
          const ob = (data as { orderBook?: Record<string, OrderBookSnapshot> }).orderBook;
          if (ob) storeAPI.dispatch(orderBookUpdated(ob));
        }
      } catch {
        // unparseable frame — discard
      }
    };

    ws.onclose = () => {
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
      if (!res1m.ok || !res5m.ok) return;
      const [candles1m, candles5m]: [OhlcCandle[], OhlcCandle[]] = await Promise.all([
        res1m.json(),
        res5m.json(),
      ]);
      if (candles1m.length > 0 || candles5m.length > 0) {
        storeAPI.dispatch(candlesSeeded({ symbol, candles: { "1m": candles1m, "5m": candles5m } }));
      }
    } catch {
      // candle-store unavailable — chart will populate from live ticks
    }
  }

  async function fetchAssetsAndSeedCandles() {
    try {
      const r = await fetch(`${MARKET_HTTP_URL}/assets`);
      const data: AssetDef[] = await r.json();
      storeAPI.dispatch(marketSlice.actions.setAssets(data));

      if (data.length === 0) return;

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

  // Start fetching assets and connecting to market feed immediately
  // This is the initialization that happens on app load
  if (!started) {
    started = true;
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

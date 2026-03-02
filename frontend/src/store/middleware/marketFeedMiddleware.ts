import type { Middleware } from "@reduxjs/toolkit";
import type { AssetDef, MarketPrices, OrderBookSnapshot } from "../../types.ts";
import { marketSlice, orderBookUpdated } from "../marketSlice.ts";

// Derive base URLs from the current origin so the app works behind Traefik
// without any environment variables. VITE_* overrides remain available for
// non-standard deployments (separate hosts, custom ports, etc).
const _origin = typeof window !== "undefined" ? window.location.origin : "";
const _wsOrigin = _origin.replace(/^http/, "ws");
const MARKET_WS_URL = import.meta.env.VITE_MARKET_WS_URL ?? `${_wsOrigin}/ws/market-sim`;
const MARKET_HTTP_URL = import.meta.env.VITE_MARKET_HTTP_URL ?? `${_origin}/api/market-sim`;

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

  function fetchAssets() {
    fetch(`${MARKET_HTTP_URL}/assets`)
      .then((r) => r.json())
      .then((data: AssetDef[]) => {
        storeAPI.dispatch(marketSlice.actions.setAssets(data));
      })
      .catch(() => {});
  }

  return (next) => (action: unknown) => {
    if (!started) {
      started = true;
      fetchAssets();
      connect();
    }
    if ((action as { type: string }).type === "marketFeed/stop") {
      ws?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    }
    return next(action);
  };
};

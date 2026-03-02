import type { Middleware } from "@reduxjs/toolkit";
import type { AssetDef, MarketPrices } from "../../types.ts";
import { marketSlice } from "../marketSlice.ts";

// Derive base URLs from the current origin so the app works behind Traefik
// without any environment variables. VITE_* overrides remain available for
// non-standard deployments (separate hosts, custom ports, etc).
const _origin = typeof window !== "undefined" ? window.location.origin : "";
const _wsOrigin = _origin.replace(/^http/, "ws");
const MARKET_WS_URL =
  import.meta.env.VITE_MARKET_WS_URL ?? `${_wsOrigin}/ws/market-sim`;
const MARKET_HTTP_URL =
  import.meta.env.VITE_MARKET_HTTP_URL ?? `${_origin}/api/market-sim`;

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
            | { prices: MarketPrices; volumes: Record<string, number>; marketMinute: number };
        };
        const newPrices: MarketPrices =
          msg.data !== null && typeof msg.data === "object" && "prices" in msg.data
            ? (msg.data as { prices: MarketPrices }).prices
            : (msg.data as MarketPrices);
        storeAPI.dispatch(marketSlice.actions.tickReceived({ prices: newPrices, ts: Date.now() }));
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

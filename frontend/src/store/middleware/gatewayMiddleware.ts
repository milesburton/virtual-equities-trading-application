/**
 * Gateway middleware
 *
 * The GUI's single connection to the backend. Replaces:
 *   - marketFeedMiddleware (direct market-sim WebSocket)
 *   - fixMiddleware (direct FIX gateway WebSocket)
 *   - direct HTTP calls to algo/ems/journal services
 *
 * One WebSocket to the gateway service; the gateway fans out all events.
 *
 * Inbound (gateway → GUI) event types:
 *   marketUpdate   → market tick data (prices, volumes, orderBook)
 *   orderEvent     → order lifecycle (submitted, routed, child, filled, expired, rejected)
 *   algoHeartbeat  → algo engine status
 *   orderAck       → gateway confirmed order was published to bus
 *   error          → gateway-level error
 *
 * Outbound (GUI → gateway):
 *   { type: "submitOrder", payload: Trade }
 */

import type { Middleware } from "@reduxjs/toolkit";
import type { AssetDef, OhlcCandle, OrderBookSnapshot, OrderRecord } from "../../types.ts";
import type { AuthUser, TradingLimits } from "../authSlice.ts";
import { setUserWithLimits } from "../authSlice.ts";
import { candlesSeeded, marketSlice, orderBookUpdated } from "../marketSlice.ts";
import type { NewsItem } from "../newsSlice.ts";
import { newsBatchReceived, newsItemReceived } from "../newsSlice.ts";
import {
  childAdded,
  fillReceived,
  orderAdded,
  orderPatched,
  setGatewayWs,
} from "../ordersSlice.ts";
import { setSelectedAsset } from "../uiSlice.ts";

const _origin = typeof window !== "undefined" ? window.location.origin : "";
const _wsOrigin = _origin.replace(/^http/, "ws");

const GATEWAY_WS_URL = import.meta.env.VITE_GATEWAY_WS_URL ?? `${_wsOrigin}/ws/gateway`;
const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL ?? `${_origin}/api/gateway`;

const UI_TICK_INTERVAL_MS = 250;

// ── Inbound message shapes ────────────────────────────────────────────────────

interface MarketUpdateData {
  prices: Record<string, number>;
  volumes: Record<string, number>;
  orderBook?: Record<string, OrderBookSnapshot>;
}

interface OrderEventData {
  // orders.filled fields
  childId?: string;
  parentOrderId?: string;
  clientOrderId?: string;
  filledQty?: number;
  remainingQty?: number;
  avgFillPrice?: number;
  marketImpactBps?: number;
  venue?: string;
  venueName?: string;
  counterparty?: string;
  liquidityFlag?: "MAKER" | "TAKER" | "CROSS";
  commissionUSD?: number;
  secFeeUSD?: number;
  finraTafUSD?: number;
  totalFeeUSD?: number;
  settlementDate?: string;
  // orders.submitted / orders.routed / orders.new fields
  orderId?: string;
  asset?: string;
  side?: "BUY" | "SELL";
  quantity?: number;
  limitPrice?: number;
  expiresAt?: number;
  strategy?: string;
  algoParams?: Record<string, unknown>;
  status?: string;
  algo?: string;
  ts?: number;
}

export const gatewayMiddleware: Middleware = (storeAPI) => {
  let ws: WebSocket | null = null;
  let reconnectDelay = 2_000;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let started = false;

  // Tick batching
  let pendingPrices: Record<string, number> | null = null;
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

  function handleMarketUpdate(data: MarketUpdateData) {
    pendingPrices = data.prices;
    for (const [sym, vol] of Object.entries(data.volumes ?? {})) {
      pendingVolumes[sym] = (pendingVolumes[sym] ?? 0) + vol;
    }
    if (data.orderBook) pendingOrderBook = data.orderBook;
    if (!tickTimer) tickTimer = setTimeout(flushTick, UI_TICK_INTERVAL_MS);
  }

  function handleOrderEvent(topic: string, data: OrderEventData) {
    switch (topic) {
      case "orders.submitted":
      case "orders.new": {
        // Order acknowledged by OMS — add to blotter if not already there
        // (GUI may have added optimistically via orderAck; patch if needed)
        if (data.orderId) {
          storeAPI.dispatch(
            orderPatched({
              id: data.clientOrderId ?? data.orderId,
              patch: { status: "queued" },
            })
          );
        }
        break;
      }
      case "orders.routed": {
        if (data.orderId) {
          storeAPI.dispatch(
            orderPatched({
              id: data.clientOrderId ?? data.orderId,
              patch: { status: "executing" },
            })
          );
        }
        break;
      }
      case "orders.child": {
        if (data.parentOrderId && data.childId) {
          storeAPI.dispatch(
            childAdded({
              parentId: data.clientOrderId ?? data.parentOrderId,
              child: {
                id: data.childId,
                parentId: data.clientOrderId ?? data.parentOrderId,
                asset: data.asset ?? "",
                side: data.side ?? "BUY",
                quantity: data.quantity ?? 0,
                limitPrice: data.limitPrice ?? 0,
                status: "executing",
                filled: 0,
                submittedAt: data.ts ?? Date.now(),
              },
            })
          );
        }
        break;
      }
      case "orders.filled": {
        if (data.parentOrderId && data.filledQty != null) {
          storeAPI.dispatch(
            fillReceived({
              clOrdId: data.clientOrderId ?? data.parentOrderId,
              filledQty: data.filledQty,
              avgFillPrice: data.avgFillPrice ?? 0,
              leavesQty: data.remainingQty ?? 0,
            })
          );
          // Update child order if present
          if (data.childId) {
            storeAPI.dispatch(
              childAdded({
                parentId: data.clientOrderId ?? data.parentOrderId,
                child: {
                  id: data.childId,
                  parentId: data.clientOrderId ?? data.parentOrderId,
                  asset: data.asset ?? "",
                  side: data.side ?? "BUY",
                  quantity: data.filledQty,
                  limitPrice: data.avgFillPrice ?? 0,
                  status: "filled",
                  filled: data.filledQty,
                  submittedAt: data.ts ?? Date.now(),
                  avgFillPrice: data.avgFillPrice,
                  commissionUSD: data.commissionUSD,
                  venue: data.venue as import("../../types.ts").VenueMIC | undefined,
                  counterparty: data.counterparty,
                  liquidityFlag: data.liquidityFlag,
                  settlementDate: data.settlementDate,
                },
              })
            );
          }
        }
        break;
      }
      case "orders.expired": {
        if (data.orderId) {
          storeAPI.dispatch(
            orderPatched({
              id: data.clientOrderId ?? data.orderId,
              patch: { status: "expired" },
            })
          );
        }
        break;
      }
      case "orders.rejected": {
        if (data.clientOrderId) {
          storeAPI.dispatch(
            orderPatched({
              id: data.clientOrderId,
              patch: { status: "rejected" },
            })
          );
        }
        break;
      }
    }
  }

  function connect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    ws = new WebSocket(GATEWAY_WS_URL);

    ws.onopen = () => {
      console.log("[gateway] Connected");
      reconnectDelay = 2_000;
      setGatewayWs(ws);
      storeAPI.dispatch(marketSlice.actions.setConnected(true));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as {
          event: string;
          topic?: string;
          data: unknown;
        };

        switch (msg.event) {
          case "marketUpdate":
            handleMarketUpdate(msg.data as MarketUpdateData);
            break;
          case "orderEvent":
            handleOrderEvent(msg.topic ?? "", msg.data as OrderEventData);
            break;
          case "orderAck": {
            // Gateway confirmed order on bus — order already in Redux from submitOrderThunk
            break;
          }
          case "orderRejected": {
            // Gateway-level rejection (auth failed for this order)
            const rejData = msg.data as { reason?: string; clientOrderId?: string };
            console.warn("[gateway] Order rejected by gateway:", rejData.reason);
            if (rejData.clientOrderId) {
              storeAPI.dispatch(
                orderPatched({
                  id: rejData.clientOrderId,
                  patch: { status: "rejected" },
                })
              );
            }
            break;
          }
          case "authIdentity": {
            // Gateway sends user identity + limits after WS connection is established
            const identityData = msg.data as { user: AuthUser; limits: TradingLimits };
            storeAPI.dispatch(setUserWithLimits(identityData));
            break;
          }
          case "newsUpdate":
            storeAPI.dispatch(newsItemReceived(msg.data as NewsItem));
            break;
          case "error":
            console.error("[gateway] Server error:", (msg.data as { message?: string }).message);
            break;
        }
      } catch {
        // ignore unparseable frames
      }
    };

    ws.onclose = () => {
      setGatewayWs(null);
      storeAPI.dispatch(marketSlice.actions.setConnected(false));
      if (tickTimer) {
        clearTimeout(tickTimer);
        tickTimer = null;
      }
      console.warn(`[gateway] Disconnected — reconnecting in ${reconnectDelay}ms`);
      reconnectTimer = setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
        connect();
      }, reconnectDelay);
    };

    ws.onerror = () => ws?.close();
  }

  async function fetchCandlesForAsset(symbol: string) {
    try {
      const [res1m, res5m] = await Promise.all([
        fetch(`${GATEWAY_URL}/candles?instrument=${symbol}&interval=1m&limit=120`),
        fetch(`${GATEWAY_URL}/candles?instrument=${symbol}&interval=5m&limit=120`),
      ]);
      const candles1m: OhlcCandle[] = res1m.ok ? await res1m.json() : [];
      const candles5m: OhlcCandle[] = res5m.ok ? await res5m.json() : [];
      storeAPI.dispatch(candlesSeeded({ symbol, candles: { "1m": candles1m, "5m": candles5m } }));
    } catch {
      storeAPI.dispatch(candlesSeeded({ symbol, candles: { "1m": [], "5m": [] } }));
    }
  }

  async function fetchAssetsAndSeedCandles() {
    try {
      const r = await fetch(`${GATEWAY_URL}/assets`);
      if (!r.ok) return;
      const data: AssetDef[] = await r.json();
      storeAPI.dispatch(marketSlice.actions.setAssets(data));
      if (data.length === 0) return;
      storeAPI.dispatch(setSelectedAsset(data[0].symbol));
      await fetchCandlesForAsset(data[0].symbol);
      for (let i = 1; i < data.length; i++) {
        await new Promise((res) => setTimeout(res, 50));
        fetchCandlesForAsset(data[i].symbol);
      }
    } catch {
      // gateway unavailable
    }
  }

  async function hydrateOrders() {
    try {
      const res = await fetch(`${GATEWAY_URL}/orders?limit=200`);
      if (!res.ok) return;
      const orders: OrderRecord[] = await res.json();
      for (const order of [...orders].reverse()) {
        storeAPI.dispatch(orderAdded(order));
      }
    } catch {
      // journal unavailable
    }
  }

  async function hydrateNewsForSymbol(symbol: string) {
    try {
      const NEWS_URL = import.meta.env.VITE_NEWS_AGGREGATOR_URL ?? `${_origin}/api/news-aggregator`;
      const res = await fetch(`${NEWS_URL}/news?symbol=${encodeURIComponent(symbol)}&limit=50`);
      if (!res.ok) return;
      const items: NewsItem[] = await res.json();
      if (items.length > 0) storeAPI.dispatch(newsBatchReceived(items));
    } catch {
      // news-aggregator unavailable
    }
  }

  if (!started) {
    started = true;
    hydrateOrders();
    fetchAssetsAndSeedCandles().then(() => {
      // Hydrate news for first selected asset after assets are loaded
      const state = storeAPI.getState() as { ui: { selectedAsset: string | null } };
      if (state.ui.selectedAsset) hydrateNewsForSymbol(state.ui.selectedAsset);
    });
    connect();
  }

  return (next) => (action: unknown) => {
    const result = next(action);

    // Hydrate news when selected symbol changes
    if (setSelectedAsset.match(action as Parameters<typeof setSelectedAsset.match>[0])) {
      const symbol = (action as ReturnType<typeof setSelectedAsset>).payload;
      if (symbol) hydrateNewsForSymbol(symbol);
    }

    if ((action as { type: string }).type === "marketFeed/stop") {
      ws?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    }
    return result;
  };
};

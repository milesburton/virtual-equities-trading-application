/**
 * GatewayMock — typed WebSocket + HTTP interceptor for Playwright tests.
 *
 * Intercepts:
 *   ws://localhost:PORT/ws/gateway   → fake WebSocket server
 *   /api/user-service/sessions/me   → mock session response
 *   /api/**                         → stub all other GETs to null
 *
 * Usage:
 *   const gw = await GatewayMock.attach(page);
 *   await gw.sendAuthIdentity({ role: "trader" });
 *   await gw.sendMarketUpdate({ AAPL: 189.5, MSFT: 421.0 });
 *   const msg = await gw.nextOutbound("submitOrder");
 */

import type { Page, WebSocketRoute } from "@playwright/test";

// ── Protocol types (mirroring gatewayMiddleware) ──────────────────────────────

export interface AuthUser {
  id: string;
  name: string;
  role: "trader" | "admin";
  avatar_emoji: string;
}

export interface TradingLimits {
  max_order_qty: number;
  max_daily_notional: number;
  allowed_strategies: string[];
}

export interface AssetDef {
  symbol: string;
  name: string;
  sector: string;
  exchange?: string;
  marketCapB?: number;
  beta?: number;
  dividendYield?: number;
  peRatio?: number;
}

// Inbound message shapes (gateway → client)
type GatewayInbound =
  | { event: "authIdentity"; data: { user: AuthUser; limits: TradingLimits } }
  | { event: "marketUpdate"; data: { prices: Record<string, number>; volumes: Record<string, number> } }
  | { event: "orderEvent"; topic: string; data: Record<string, unknown> }
  | { event: "orderRejected"; data: { clientOrderId: string; reason: string } }
  | { event: "newsUpdate"; data: Record<string, unknown> };

// Outbound message shape (client → gateway)
interface GatewayOutbound {
  type: string;
  payload: Record<string, unknown>;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_TRADER: AuthUser = {
  id: "trader-1",
  name: "Alice Chen",
  role: "trader",
  avatar_emoji: "AL",
};

export const DEFAULT_ADMIN: AuthUser = {
  id: "admin-1",
  name: "Admin User",
  role: "admin",
  avatar_emoji: "AD",
};

export const DEFAULT_LIMITS: TradingLimits = {
  max_order_qty: 10_000,
  max_daily_notional: 1_000_000,
  allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP"],
};

export const DEFAULT_ASSETS: AssetDef[] = [
  { symbol: "AAPL", name: "Apple Inc.", sector: "Technology", exchange: "NASDAQ", marketCapB: 3000, beta: 1.2 },
  { symbol: "MSFT", name: "Microsoft Corp.", sector: "Technology", exchange: "NASDAQ", marketCapB: 2800, beta: 0.9 },
  { symbol: "GOOGL", name: "Alphabet Inc.", sector: "Technology", exchange: "NASDAQ", marketCapB: 1800, beta: 1.1 },
];

// ── GatewayMock class ─────────────────────────────────────────────────────────

export class GatewayMock {
  private _wsRoute: WebSocketRoute | null = null;
  private _outboundQueue: GatewayOutbound[] = [];
  private _outboundResolvers: Array<{ type: string; resolve: (msg: GatewayOutbound) => void }> = [];

  private constructor(private readonly page: Page) {}

  /**
   * Attach mock to the page. Must be called BEFORE page.goto().
   * Sets up WS interception and stubs all backend HTTP.
   */
  static async attach(
    page: Page,
    opts: { user?: AuthUser; assets?: AssetDef[] } = {}
  ): Promise<GatewayMock> {
    const mock = new GatewayMock(page);
    const user = opts.user ?? DEFAULT_TRADER;
    const assets = opts.assets ?? DEFAULT_ASSETS;

    // Playwright matches routes in reverse-registration order (last registered wins).
    // Register the catch-all FIRST so specific routes registered after take precedence.

    // Catch-all: stub remaining GET /api/** to null (registered first = lowest priority)
    await page.route("/api/**", (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      return route.fulfill({ status: 200, contentType: "application/json", body: "null" });
    });

    // Stub news
    await page.route("/api/news-aggregator/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    );

    // Stub orders history (empty — no pre-existing orders)
    await page.route("/api/gateway/orders**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    );

    // Stub candles (empty arrays — candle chart shows loading spinner)
    await page.route("/api/gateway/candles**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    );

    // Stub assets endpoint
    await page.route("/api/gateway/assets", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(assets) })
    );

    // Stub auth session (registered last = highest priority)
    await page.route("/api/user-service/sessions", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) })
    );
    await page.route("/api/user-service/sessions/me", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) })
    );

    // Intercept WebSocket
    await page.routeWebSocket("/ws/gateway", (ws) => {
      mock._wsRoute = ws;

      ws.onMessage((raw) => {
        try {
          const msg = JSON.parse(raw as string) as GatewayOutbound;
          // Settle any waiting promises first
          const idx = mock._outboundResolvers.findIndex((r) => r.type === msg.type);
          if (idx !== -1) {
            const [resolver] = mock._outboundResolvers.splice(idx, 1);
            resolver.resolve(msg);
          } else {
            mock._outboundQueue.push(msg);
          }
        } catch {
          // ignore unparseable
        }
      });
    });

    return mock;
  }

  // ── Send helpers (gateway → client) ────────────────────────────────────────

  private _send(msg: GatewayInbound) {
    this._wsRoute?.send(JSON.stringify(msg));
  }

  /** Send authIdentity — sets user and trading limits in Redux. */
  sendAuthIdentity(opts: { user?: AuthUser; limits?: TradingLimits } = {}) {
    this._send({
      event: "authIdentity",
      data: {
        user: opts.user ?? DEFAULT_TRADER,
        limits: opts.limits ?? DEFAULT_LIMITS,
      },
    });
  }

  /** Send a market price update. Volumes default to 1000 per symbol. */
  sendMarketUpdate(prices: Record<string, number>, volumes?: Record<string, number>) {
    const vols = volumes ?? Object.fromEntries(Object.keys(prices).map((s) => [s, 1000]));
    this._send({ event: "marketUpdate", data: { prices, volumes: vols } });
  }

  /** Send an order event on the given topic. */
  sendOrderEvent(topic: string, data: Record<string, unknown>) {
    this._send({ event: "orderEvent", topic, data });
  }

  /**
   * Simulate a full order lifecycle: submitted → routed → filled.
   * Pass the clientOrderId that the frontend used when submitting.
   */
  sendOrderLifecycle(
    clientOrderId: string,
    opts: {
      orderId?: string;
      asset?: string;
      side?: "BUY" | "SELL";
      quantity?: number;
      limitPrice?: number;
      stages?: Array<"submitted" | "routed" | "filled" | "rejected" | "expired">;
    } = {}
  ) {
    const orderId = opts.orderId ?? `ord-${Date.now()}`;
    const asset = opts.asset ?? "AAPL";
    const side = opts.side ?? "BUY";
    const quantity = opts.quantity ?? 100;
    const limitPrice = opts.limitPrice ?? 189.5;
    const stages = opts.stages ?? ["submitted", "routed", "filled"];

    for (const stage of stages) {
      switch (stage) {
        case "submitted":
          this.sendOrderEvent("orders.submitted", { orderId, clientOrderId, asset, side, quantity, limitPrice, status: "queued" });
          break;
        case "routed":
          this.sendOrderEvent("orders.routed", { orderId, clientOrderId, strategy: "LIMIT" });
          break;
        case "filled":
          this.sendOrderEvent("orders.filled", {
            parentOrderId: orderId,
            clientOrderId,
            childId: `child-${Date.now()}`,
            asset,
            side,
            filledQty: quantity,
            remainingQty: 0,
            avgFillPrice: limitPrice,
            venue: "XNAS",
            liquidityFlag: "MAKER",
            commissionUSD: 1.5,
            ts: Date.now(),
          });
          break;
        case "rejected":
          this.sendOrderEvent("orders.rejected", { clientOrderId, reason: "Insufficient funds" });
          break;
        case "expired":
          this.sendOrderEvent("orders.expired", { orderId, clientOrderId });
          break;
      }
    }
  }

  /** Send a gateway-level orderRejected (auth failure path). */
  sendOrderRejected(clientOrderId: string, reason = "Unauthenticated") {
    this._send({ event: "orderRejected", data: { clientOrderId, reason } });
  }

  /** Send a news item update. */
  sendNewsUpdate(item: {
    id: string;
    symbol: string;
    headline: string;
    source: string;
    url: string;
    publishedAt: number;
    sentiment: "positive" | "negative" | "neutral";
    sentimentScore: number;
    relatedSymbols: string[];
  }) {
    this._send({ event: "newsUpdate", data: item });
  }

  // ── Receive helpers (client → gateway) ─────────────────────────────────────

  /**
   * Wait for the next outbound message of the given type from the client.
   * Resolves with the full message. Rejects after timeout.
   */
  nextOutbound(type: string, timeoutMs = 5_000): Promise<GatewayOutbound> {
    // Check if already buffered
    const idx = this._outboundQueue.findIndex((m) => m.type === type);
    if (idx !== -1) {
      const [msg] = this._outboundQueue.splice(idx, 1);
      return Promise.resolve(msg);
    }
    // Otherwise wait
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const ri = this._outboundResolvers.findIndex((r) => r.resolve === resolve);
        if (ri !== -1) this._outboundResolvers.splice(ri, 1);
        reject(new Error(`Timed out waiting for outbound message type="${type}" after ${timeoutMs}ms`));
      }, timeoutMs);

      this._outboundResolvers.push({
        type,
        resolve: (msg) => {
          clearTimeout(timer);
          resolve(msg);
        },
      });
    });
  }
}

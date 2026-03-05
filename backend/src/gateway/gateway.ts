/**
 * API Gateway / BFF (Backend for Frontend)
 *
 * The GUI connects ONLY here. No other backend service is reachable from the browser.
 *
 * Responsibilities:
 *   - WebSocket hub: push market ticks, order events, fills to every GUI client
 *   - Accepts order submission from GUI → publishes to orders.new on the bus
 *   - Proxies read-only HTTP requests (assets, candles, orders history)
 *   - Provides /health for service discovery
 *
 * Message bus topics subscribed:
 *   market.ticks  → forwarded to GUI as { event: "marketUpdate", data: ... }
 *   orders.*      → forwarded to GUI as { event: "orderEvent", topic, data: ... }
 *   algo.heartbeat→ forwarded to GUI as { event: "algoHeartbeat", data: ... }
 *
 * Topic published:
 *   orders.new    → OMS picks this up to route the order
 */

import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { serve } from "https://deno.land/std@0.210.0/http/server.ts";
import { createConsumer, createProducer } from "../lib/messaging.ts";

const PORT = Number(Deno.env.get("GATEWAY_PORT")) || 5_011;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

// Internal service URLs — only the gateway touches these directly
const MARKET_SIM_URL = `http://${Deno.env.get("MARKET_SIM_HOST") ?? "localhost"}:${Deno.env.get("MARKET_SIM_PORT") ?? "5000"}`;
const JOURNAL_URL = `http://${Deno.env.get("JOURNAL_HOST") ?? "localhost"}:${Deno.env.get("JOURNAL_PORT") ?? "5009"}`;
const USER_SERVICE_URL = `http://${Deno.env.get("USER_SERVICE_HOST") ?? "localhost"}:${Deno.env.get("USER_SERVICE_PORT") ?? "5008"}`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ── Auth helpers ──────────────────────────────────────────────────────────────

interface AuthenticatedUser {
  id: string;
  name: string;
  role: string;
  avatar_emoji: string;
}

interface UserLimits {
  max_order_qty: number;
  max_daily_notional: number;
  allowed_strategies: string[];
}

/** Extract the veta_user session token from Cookie header. */
function getCookieToken(req: Request): string | null {
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(/veta_user=([^;]+)/);
  return match ? match[1] : null;
}

/**
 * Validate a session token against user-service.
 * Returns { user, limits } on success, null on failure.
 * Results are cached per token for 10 seconds to avoid per-request DB calls.
 */
const authCache = new Map<string, { result: { user: AuthenticatedUser; limits: UserLimits }; expiresAt: number }>();

async function validateToken(token: string): Promise<{ user: AuthenticatedUser; limits: UserLimits } | null> {
  const now = Date.now();
  const cached = authCache.get(token);
  if (cached) {
    if (cached.expiresAt > now) return cached.result;
    authCache.delete(token); // evict expired entry
  }

  try {
    const res = await fetch(`${USER_SERVICE_URL}/sessions/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) return null;
    const result = await res.json() as { user: AuthenticatedUser; limits: UserLimits };
    authCache.set(token, { result, expiresAt: now + 10_000 });
    return result;
  } catch {
    return null;
  }
}

/** Authenticate a request. Returns the auth result or a 401 Response. */
async function requireAuth(req: Request): Promise<{ user: AuthenticatedUser; limits: UserLimits } | Response> {
  const url = new URL(req.url);
  const token = getCookieToken(req);
  if (!token) {
    publishAccessEvent({ action: "auth_failure", path: url.pathname, reason: "no session cookie" });
    return new Response(JSON.stringify({ error: "unauthenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
  const auth = await validateToken(token);
  if (!auth) {
    publishAccessEvent({ action: "auth_failure", path: url.pathname, reason: "invalid or expired token" });
    return new Response(JSON.stringify({ error: "unauthenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
  publishAccessEvent({ action: "http_request", userId: auth.user.id, userRole: auth.user.role, path: url.pathname });
  return auth;
}

function isResponse(v: unknown): v is Response {
  return v instanceof Response;
}

/** Publish a user.access event to the bus (best-effort, never throws). */
function publishAccessEvent(event: {
  action: string;         // "ws_connect" | "http_request" | "auth_failure" | "order_submitted" | "order_rejected"
  userId?: string;
  userRole?: string;
  path?: string;
  reason?: string;        // for rejections/failures
  orderId?: string;
}) {
  producer?.send("user.access", { ...event, ts: Date.now() }).catch(() => {});
}

// ── Connected GUI clients ─────────────────────────────────────────────────────

const clients = new Set<WebSocket>();

function broadcast(msg: unknown): void {
  const frame = JSON.stringify(msg);
  for (const ws of clients) {
    try {
      if (ws.readyState === WebSocket.OPEN) ws.send(frame);
    } catch {
      clients.delete(ws);
    }
  }
}

// ── Redpanda producer (for orders.new) ───────────────────────────────────────

const producer = await createProducer("gateway").catch((err) => {
  console.warn("[gateway] Redpanda unavailable for publishing:", err.message);
  return null;
});

// ── Redpanda consumers → push to all GUI clients ──────────────────────────────

const ORDER_TOPICS = [
  "orders.new",
  "orders.submitted",
  "orders.routed",
  "orders.child",
  "orders.filled",
  "orders.expired",
];

async function startConsumers(): Promise<void> {
  // Market ticks — forwarded verbatim
  try {
    const marketConsumer = await createConsumer("gateway-market", ["market.ticks"]);
    marketConsumer.onMessage((_topic, value) => {
      broadcast({ event: "marketUpdate", data: value });
    });
  } catch (err) {
    console.warn("[gateway] Could not subscribe to market.ticks:", (err as Error).message);
  }

  // Order lifecycle events
  try {
    const orderConsumer = await createConsumer("gateway-orders", ORDER_TOPICS);
    orderConsumer.onMessage((topic, value) => {
      broadcast({ event: "orderEvent", topic, data: value });
    });
  } catch (err) {
    console.warn("[gateway] Could not subscribe to order topics:", (err as Error).message);
  }

  // Algo heartbeats
  try {
    const algoConsumer = await createConsumer("gateway-algo", ["algo.heartbeat"]);
    algoConsumer.onMessage((_topic, value) => {
      broadcast({ event: "algoHeartbeat", data: value });
    });
  } catch (err) {
    console.warn("[gateway] Could not subscribe to algo.heartbeat:", (err as Error).message);
  }

  // News feed — forward to GUI as newsUpdate events
  try {
    const newsConsumer = await createConsumer("gateway-news", ["news.feed"]);
    newsConsumer.onMessage((_topic, value) => {
      broadcast({ event: "newsUpdate", data: value });
    });
  } catch (err) {
    console.warn("[gateway] Could not subscribe to news.feed:", (err as Error).message);
  }
}

await startConsumers();

// ── HTTP / WebSocket handler ──────────────────────────────────────────────────

async function proxyGet(internalUrl: string, req: Request): Promise<Response> {
  const src = new URL(req.url);
  const target = new URL(internalUrl);
  // Forward query string
  target.search = src.search;
  try {
    const res = await fetch(target.toString(), {
      signal: AbortSignal.timeout(8_000),
    });
    const body = await res.arrayBuffer();
    return new Response(body, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "application/json",
        ...CORS_HEADERS,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 502,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
}

serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // ── Health ──
  if (path === "/health" && req.method === "GET") {
    return new Response(
      JSON.stringify({ service: "gateway", version: VERSION, status: "ok" }),
      { headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  }

  // ── WebSocket hub ──
  if (path === "/ws" || path === "/ws/gateway") {
    if (req.headers.get("upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    // Authenticate before upgrading — WebSocket clients can't receive HTTP 401 after upgrade
    const token = getCookieToken(req);
    const auth = token ? await validateToken(token) : null;
    // We allow unauthenticated WS connections for market data (read-only push).
    // Order submission will be rejected per-message if auth is missing.

    const { socket, response } = Deno.upgradeWebSocket(req);

    socket.onopen = () => {
      clients.add(socket);
      console.log(`[gateway] Client connected user=${auth?.user.id ?? "anonymous"} (total=${clients.size})`);
      // Immediately send the client their identity so they can sync Redux state
      if (auth) {
        socket.send(JSON.stringify({ event: "authIdentity", data: { user: auth.user, limits: auth.limits } }));
        publishAccessEvent({ action: "ws_connect", userId: auth.user.id, userRole: auth.user.role });
      } else {
        publishAccessEvent({ action: "ws_connect", reason: "anonymous — no valid session" });
      }
    };

    socket.onmessage = async (event) => {
      // GUI sends: { type: "submitOrder", payload: Trade }
      try {
        const msg = JSON.parse(event.data as string) as { type: string; payload: Record<string, unknown> };
        if (msg.type === "submitOrder") {
          // Re-validate on every order submission (token may have expired)
          const currentToken = token;
          const currentAuth = currentToken ? await validateToken(currentToken) : null;
          if (!currentAuth) {
            publishAccessEvent({ action: "order_rejected", reason: "unauthenticated — session expired" });
            socket.send(JSON.stringify({
              event: "orderRejected",
              data: {
                reason: "Unauthenticated — please log in again",
                clientOrderId: msg.payload.clientOrderId ?? null,
              },
            }));
            return;
          }
          if (!producer) {
            socket.send(JSON.stringify({ event: "error", message: "Bus unavailable — order not submitted" }));
            return;
          }
          // Attach user identity to the order so OMS can enforce limits
          const orderWithUser = {
            ...msg.payload,
            userId: currentAuth.user.id,
            userRole: currentAuth.user.role,
          };
          await producer.send("orders.new", orderWithUser);
          publishAccessEvent({
            action: "order_submitted",
            userId: currentAuth.user.id,
            userRole: currentAuth.user.role,
            orderId: (msg.payload.clientOrderId ?? msg.payload.orderId) as string | undefined,
          });
          // Ack so GUI knows the order reached the bus
          socket.send(JSON.stringify({ event: "orderAck", data: orderWithUser }));
        }
      } catch (err) {
        socket.send(JSON.stringify({ event: "error", message: (err as Error).message }));
      }
    };

    socket.onclose = () => {
      clients.delete(socket);
      console.log(`[gateway] Client disconnected (total=${clients.size})`);
    };

    socket.onerror = () => socket.close();

    return response;
  }

  // ── Proxy: asset list (auth required) ──
  if (path === "/assets" && req.method === "GET") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${MARKET_SIM_URL}/assets`, req);
  }

  // ── Proxy: candles (auth required) ──
  if (path === "/candles" && req.method === "GET") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${JOURNAL_URL}/candles`, req);
  }

  // ── Proxy: order history (auth required) ──
  if (path === "/orders" && req.method === "GET") {
    const auth = await requireAuth(req);
    if (isResponse(auth)) return auth;
    return proxyGet(`${JOURNAL_URL}/orders`, req);
  }

  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
}, { port: PORT });

console.log(`[gateway] API Gateway running on port ${PORT}`);

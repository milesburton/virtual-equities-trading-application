// FIX Gateway — HTTP/WebSocket server on port 9881
// Bridges browser WebSocket connections to the FIX Exchange TCP listener (port 9880).
// Each WS client gets a dedicated TCP connection to the exchange.
//
// Routes:
//   GET /ws/fix   → WebSocket upgrade → proxy to fixExchange TCP
//   GET /health   → JSON health check

import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { serve } from "https://deno.land/std@0.210.0/http/server.ts";

const FIX_GATEWAY_PORT = Number(Deno.env.get("FIX_GATEWAY_PORT")) || 9_881;
const FIX_EXCHANGE_HOST = Deno.env.get("FIX_EXCHANGE_HOST") || "localhost";
const FIX_EXCHANGE_PORT = Number(Deno.env.get("FIX_EXCHANGE_PORT")) || 9_880;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ─── Per-connection bridge ────────────────────────────────────────────────────

async function bridgeConnection(ws: WebSocket): Promise<void> {
  let tcpConn: Deno.TcpConn | null = null;
  let closed = false;

  function closeBoth(): void {
    if (closed) return;
    closed = true;
    try { ws.close(); } catch { /* already closed */ }
    try { tcpConn?.close(); } catch { /* already closed */ }
  }

  // Connect to FIX Exchange TCP
  try {
    tcpConn = await Deno.connect({ hostname: FIX_EXCHANGE_HOST, port: FIX_EXCHANGE_PORT });
  } catch (err) {
    console.error(`[FIX Gateway] Cannot connect to exchange at ${FIX_EXCHANGE_HOST}:${FIX_EXCHANGE_PORT}:`, err);
    ws.close(1011, "Exchange unavailable");
    return;
  }

  console.log(`[FIX Gateway] Bridging WS client to ${FIX_EXCHANGE_HOST}:${FIX_EXCHANGE_PORT}`);

  // WS → TCP: forward FIX messages from browser to exchange
  ws.onmessage = async (event) => {
    if (closed || !tcpConn) return;
    try {
      const data = typeof event.data === "string"
        ? new TextEncoder().encode(event.data)
        : new Uint8Array(event.data as ArrayBuffer);
      await tcpConn.write(data);
    } catch (err) {
      console.error("[FIX Gateway] WS→TCP write error:", err);
      closeBoth();
    }
  };

  ws.onclose = () => {
    console.log("[FIX Gateway] WS client disconnected");
    closeBoth();
  };

  ws.onerror = (err) => {
    console.error("[FIX Gateway] WS error:", err);
    closeBoth();
  };

  // TCP → WS: forward FIX messages from exchange to browser
  const readBuf = new Uint8Array(8192);
  try {
    while (!closed) {
      const bytesRead = await tcpConn.read(readBuf);
      if (bytesRead === null) break; // EOF from exchange

      const chunk = new TextDecoder().decode(readBuf.subarray(0, bytesRead));
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(chunk);
      }
    }
  } catch (err) {
    if (!closed && !(err instanceof Deno.errors.BadResource)) {
      console.error("[FIX Gateway] TCP→WS read error:", err);
    }
  } finally {
    closeBoth();
  }
}

// ─── HTTP/WS request handler ──────────────────────────────────────────────────

serve((req) => {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (url.pathname === "/health" && req.method === "GET") {
    return new Response(
      JSON.stringify({ service: "fix-gateway", version: VERSION, status: "ok" }),
      { headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  }

  // WebSocket upgrade for /ws/fix or root path (Traefik strips prefix)
  if (
    req.method === "GET" &&
    (url.pathname === "/ws/fix" || url.pathname === "/") &&
    req.headers.get("upgrade")?.toLowerCase() === "websocket"
  ) {
    const { socket, response } = Deno.upgradeWebSocket(req);
    bridgeConnection(socket).catch((err) => {
      console.error("[FIX Gateway] Bridge error:", err);
    });
    return response;
  }

  return new Response("Not found", { status: 404, headers: CORS_HEADERS });
}, { port: FIX_GATEWAY_PORT });

console.log(`[FIX Gateway] Listening on port ${FIX_GATEWAY_PORT}`);
console.log(`[FIX Gateway] Bridging to exchange at ${FIX_EXCHANGE_HOST}:${FIX_EXCHANGE_PORT}`);
console.log(`[FIX Gateway] version=${VERSION}`);

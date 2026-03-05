/**
 * Integration tests — require backend services to be running.
 *
 * Tests key internal service endpoints.
 * Note: Order submission via HTTP to OMS/algo services is no longer
 * the primary path — orders flow via gateway WS → bus → OMS → algos.
 * These tests verify that internal health endpoints and bus-adjacent
 * behaviour are correct.
 */

import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.210.0/testing/asserts.ts";

const GATEWAY_URL = "http://localhost:5011";
const MARKET_URL  = "http://localhost:5000";
const OMS_URL     = "http://localhost:5002";
const LIMIT_URL   = "http://localhost:5003";
const TWAP_URL    = "http://localhost:5004";
const POV_URL     = "http://localhost:5005";
const VWAP_URL    = "http://localhost:5006";
const ARCHIVE_URL = "http://localhost:5012";

function t(ms = 5_000) { return AbortSignal.timeout(ms); }

// ── OPTIONS preflight (CORS) ──────────────────────────────────────────────────

Deno.test("[cors] OMS OPTIONS returns 204", async () => {
  const res = await fetch(OMS_URL, { method: "OPTIONS", signal: t() });
  assertEquals(res.status, 204);
  await res.body?.cancel();
});

Deno.test("[cors] gateway OPTIONS returns 204", async () => {
  const res = await fetch(GATEWAY_URL, { method: "OPTIONS", signal: t() });
  assertEquals(res.status, 204);
  await res.body?.cancel();
});

// ── Gateway proxy endpoints ───────────────────────────────────────────────────

Deno.test("[gateway] /assets returns asset list with AAPL", async () => {
  const res = await fetch(`${GATEWAY_URL}/assets`, { signal: t() });
  assertEquals(res.status, 200);
  const assets = await res.json() as { symbol: string }[];
  assert(Array.isArray(assets) && assets.length > 0);
  assertExists(assets.find((a) => a.symbol === "AAPL"));
});

Deno.test("[gateway] /candles returns array", async () => {
  const res = await fetch(`${GATEWAY_URL}/candles?instrument=AAPL&interval=1m&limit=5`, { signal: t() });
  assertEquals(res.status, 200);
  assert(Array.isArray(await res.json()));
});

Deno.test("[gateway] /orders returns array", async () => {
  const res = await fetch(`${GATEWAY_URL}/orders?limit=5`, { signal: t() });
  assertEquals(res.status, 200);
  assert(Array.isArray(await res.json()));
});

// ── Market data ───────────────────────────────────────────────────────────────

Deno.test("[market] /assets returns enriched fields", async () => {
  const res = await fetch(`${MARKET_URL}/assets`, { signal: t() });
  assertEquals(res.status, 200);
  const assets = await res.json() as { symbol: string; initialPrice: number; dailyVolume: number }[];
  assert(assets.length > 0);
  const aapl = assets.find((a) => a.symbol === "AAPL");
  assertExists(aapl);
  assert(aapl.dailyVolume > 0);
  assert(aapl.initialPrice > 0);
});

// ── Algo health: pending/active counts ───────────────────────────────────────

Deno.test("[limit-algo] health includes pending count", async () => {
  const res = await fetch(`${LIMIT_URL}/health`, { signal: t() });
  assertEquals(res.status, 200);
  const body = await res.json() as { status: string; pending: number };
  assertEquals(body.status, "ok");
  assertEquals(typeof body.pending, "number");
});

Deno.test("[pov-algo] health includes activeOrders count", async () => {
  const res = await fetch(`${POV_URL}/health`, { signal: t() });
  assertEquals(res.status, 200);
  const body = await res.json() as { status: string; activeOrders: number };
  assertEquals(body.status, "ok");
  assertEquals(typeof body.activeOrders, "number");
});

Deno.test("[vwap-algo] health includes activeOrders count", async () => {
  const res = await fetch(`${VWAP_URL}/health`, { signal: t() });
  assertEquals(res.status, 200);
  const body = await res.json() as { status: string; activeOrders: number };
  assertEquals(body.status, "ok");
  assertEquals(typeof body.activeOrders, "number");
});

Deno.test("[twap-algo] health is ok", async () => {
  const res = await fetch(`${TWAP_URL}/health`, { signal: t() });
  assertEquals(res.status, 200);
  assertEquals((await res.json() as { status: string }).status, "ok");
});

// ── FIX Archive ───────────────────────────────────────────────────────────────

Deno.test("[fix-archive] /executions?symbol=AAPL returns filtered array", async () => {
  const res = await fetch(`${ARCHIVE_URL}/executions?symbol=AAPL&limit=5`, { signal: t() });
  assertEquals(res.status, 200);
  const body = await res.json();
  assert(Array.isArray(body));
});

Deno.test("[fix-archive] /executions/:nonexistent returns 404", async () => {
  const res = await fetch(`${ARCHIVE_URL}/executions/NONEXISTENT-EXEC`, { signal: t() });
  assertEquals(res.status, 404);
  await res.body?.cancel();
});

// ── Gateway: order submission via WebSocket ───────────────────────────────────

Deno.test("[gateway] submitOrder WS message returns orderAck within 5s", async () => {
  const ws = new WebSocket(`ws://localhost:5011/ws`);
  const closed = new Promise<void>((r) => { ws.onclose = () => r(); });

  const result = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => { ws.close(); reject(new Error("timeout")); }, 5_000);
    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: "submitOrder",
        payload: {
          clientOrderId: `int-${Date.now()}`,
          asset: "MSFT",
          side: "BUY",
          quantity: 25,
          limitPrice: 420.0,
          expiresAt: 30,
          strategy: "LIMIT",
          algoParams: { strategy: "LIMIT" },
        },
      }));
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string) as { event: string };
      if (msg.event === "orderAck" || msg.event === "error") {
        clearTimeout(timer);
        ws.close();
        resolve(msg.event);
      }
    };
    ws.onerror = () => { clearTimeout(timer); reject(new Error("WS error")); };
  });

  await closed;
  assertEquals(result, "orderAck");
});

// ── OMS: health only (no longer accepts HTTP order submission) ────────────────

Deno.test("[oms] health is ok", async () => {
  const res = await fetch(`${OMS_URL}/health`, { signal: t() });
  assertEquals(res.status, 200);
  assertEquals((await res.json() as { status: string }).status, "ok");
});

Deno.test("[oms] POST / returns 404 (order submission moved to bus)", async () => {
  const res = await fetch(OMS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ asset: "AAPL", side: "BUY", quantity: 100, limitPrice: 150 }),
    signal: t(),
  });
  assertEquals(res.status, 404);
  await res.body?.cancel();
});

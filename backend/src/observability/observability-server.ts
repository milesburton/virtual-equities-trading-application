import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { DB } from "https://deno.land/x/sqlite@v3.9.1/mod.ts";
import { createConsumer } from "../lib/messaging.ts";

const PORT = Number(Deno.env.get("OBSERVABILITY_PORT")) || 5007;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

type ObsEvent = { type: string; ts?: number; payload?: Record<string, unknown> };

const broadcaster = new EventTarget();

function sendToClients(evt: ObsEvent) {
  broadcaster.dispatchEvent(new CustomEvent("event", { detail: evt }));
}

// DB persistence (retain a single trading day)
const DB_PATH = Deno.env.get("OBS_DB_PATH") || "./backend/data/observability.db";
const RETENTION_MS = Number(Deno.env.get("OBS_RETENTION_MS")) || 24 * 60 * 60 * 1000; // 24 hours

await Deno.mkdir(DB_PATH.substring(0, DB_PATH.lastIndexOf("/")), { recursive: true }).catch(() => {});
const db = new DB(DB_PATH);
db.query(`CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  ts INTEGER NOT NULL,
  payload TEXT
);`);
db.query(`CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);`);

function persistEvent(evt: ObsEvent) {
  try {
    const payload = evt.payload ? JSON.stringify(evt.payload) : null;
    const ts = evt.ts ?? Date.now();
    db.query("INSERT INTO events (type, ts, payload) VALUES (?, ?, ?);", [evt.type, ts, payload]);
    // delete older than retention window
    const cutoff = Date.now() - RETENTION_MS;
    db.query("DELETE FROM events WHERE ts < ?;", [cutoff]);
  } catch {
    // best-effort
  }
}

function ingestEvent(evt: ObsEvent) {
  persistEvent(evt);
  sendToClients(evt);
}

function loadRecent(limit = 1000) {
  const rows = [] as ObsEvent[];
  for (const [_id, type, ts, payload] of db.query(
    "SELECT id, type, ts, payload FROM events WHERE ts >= ? ORDER BY ts DESC LIMIT ?;",
    [Date.now() - RETENTION_MS, limit],
  )) {
    let parsed = null;
    try {
      parsed = payload ? JSON.parse(payload as string) : null;
    } catch {
      parsed = null;
    }
    rows.push({ type: type as string, ts: ts as number, payload: parsed });
  }
  return rows;
}

// ── Redpanda consumer ────────────────────────────────────────────────────────
// Subscribe to all system topics; each message becomes an observability event.
// Non-fatal if Redpanda is not yet available — HTTP POST still works as fallback.
const BUS_TOPICS = [
  "market.ticks",
  "orders.submitted",
  "orders.routed",
  "orders.child",
  "orders.filled",
  "orders.expired",
  "orders.rejected",
  "algo.heartbeat",
  "user.session",
  "user.access",
];

createConsumer("observability-group", BUS_TOPICS).then((consumer) => {
  consumer.onMessage((topic, value) => {
    // Skip high-frequency market ticks from being stored — they'd flood the DB.
    // Ticks are still available via the WebSocket from market-sim directly.
    if (topic === "market.ticks") return;

    ingestEvent({
      type: topic,
      ts: Date.now(),
      payload: value as Record<string, unknown>,
    });
  });
  console.log(`[observability] Subscribed to Redpanda topics: ${BUS_TOPICS.join(", ")}`);
}).catch((err) => {
  console.warn("[observability] Redpanda unavailable, falling back to HTTP-only ingest:", err.message);
});

// ── HTTP handlers ─────────────────────────────────────────────────────────────

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  if (req.method === "GET" && url.pathname === "/health") {
    return new Response(JSON.stringify({ service: "observability", version: VERSION, status: "ok" }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  if (req.method === "GET" && url.pathname === "/health/all") {
    const services = [
      { name: "market-sim",    url: `http://localhost:${Deno.env.get("MARKET_SIM_PORT") ?? 5000}/health` },
      { name: "ems",           url: `http://localhost:${Deno.env.get("EMS_PORT") ?? 5001}/health` },
      { name: "oms",           url: `http://localhost:${Deno.env.get("OMS_PORT") ?? 5002}/health` },
      { name: "limit-algo",    url: `http://localhost:${Deno.env.get("ALGO_TRADER_PORT") ?? 5003}/health` },
      { name: "twap-algo",     url: `http://localhost:${Deno.env.get("TWAP_ALGO_PORT") ?? 5004}/health` },
      { name: "pov-algo",      url: `http://localhost:${Deno.env.get("POV_ALGO_PORT") ?? 5005}/health` },
      { name: "vwap-algo",     url: `http://localhost:${Deno.env.get("VWAP_ALGO_PORT") ?? 5006}/health` },
      { name: "observability", url: `http://localhost:${PORT}/health` },
      { name: "user-service",  url: `http://localhost:${Deno.env.get("USER_SERVICE_PORT") ?? 5008}/health` },
      { name: "journal",       url: `http://localhost:${Deno.env.get("JOURNAL_PORT") ?? 5009}/health` },
    ];
    const results = await Promise.all(
      services.map(async (svc) => {
        try {
          const r = await fetch(svc.url, { signal: AbortSignal.timeout(3000) });
          return { name: svc.name, status: r.ok ? "ok" : "error" };
        } catch {
          return { name: svc.name, status: "unavailable" };
        }
      }),
    );
    const allOk = results.every((r) => r.status === "ok");
    return new Response(
      JSON.stringify({ status: allOk ? "ok" : "degraded", services: results }),
      { status: allOk ? 200 : 503, headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  }

  if (req.method === "GET" && url.pathname === "/events") {
    const rows = loadRecent(1000);
    return new Response(JSON.stringify(rows), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  // Server-Sent Events stream
  if (req.method === "GET" && url.pathname === "/stream") {
    let cleanup: (() => void) | null = null;
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const onEvent = (e: Event) => {
          const detail = (e as CustomEvent).detail as ObsEvent;
          const payload = `data: ${JSON.stringify(detail)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        };
        broadcaster.addEventListener("event", onEvent);
        // send a heartbeat occasionally to keep connections alive
        const hb = setInterval(() => {
          controller.enqueue(new TextEncoder().encode(":\n\n"));
        }, 25_000);

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "connected", ts: Date.now() })}\n\n`));

        cleanup = () => {
          broadcaster.removeEventListener("event", onEvent);
          clearInterval(hb);
        };
      },
      cancel() {
        cleanup?.();
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", ...CORS_HEADERS },
    });
  }

  // HTTP POST fallback — kept for backwards compat and local dev without Redpanda
  if (req.method === "POST" && url.pathname === "/events") {
    let body: ObsEvent | null = null;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ success: false, message: "invalid json" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    const evt: ObsEvent = { ts: Date.now(), ...(body as ObsEvent) };
    ingestEvent(evt);

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
}

Deno.serve({ port: PORT }, handle);

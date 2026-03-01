import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { serve } from "https://deno.land/std@0.210.0/http/server.ts";
import { DB } from "https://deno.land/x/sqlite@v3.12.0/mod.ts";

const PORT = Number(Deno.env.get("OBSERVABILITY_PORT")) || 5007;

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

await Deno.mkdir(new URL("./backend/data", import.meta.url).pathname, { recursive: true }).catch(() => {});
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

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  if (req.method === "GET" && url.pathname === "/health") {
    return new Response(JSON.stringify({ service: "observability", status: "ok" }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  if (req.method === "GET" && url.pathname === "/events") {
    const rows = loadRecent(1000);
    return new Response(JSON.stringify(rows), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  // Server-Sent Events stream
  if (req.method === "GET" && url.pathname === "/stream") {
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

        controller.signal.addEventListener("abort", () => {
          broadcaster.removeEventListener("event", onEvent);
          clearInterval(hb);
        });
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", ...CORS_HEADERS },
    });
  }

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
    // persist and broadcast
    persistEvent(evt);
    sendToClients(evt);

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
}

console.log(`🔭 Observability service running on port ${PORT}`);
serve(handle, { port: PORT });

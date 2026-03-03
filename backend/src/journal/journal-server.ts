import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { serve } from "https://deno.land/std@0.210.0/http/server.ts";
import { DB } from "https://deno.land/x/sqlite@v3.9.1/mod.ts";
import { createConsumer } from "../lib/messaging.ts";

const PORT = Number(Deno.env.get("JOURNAL_PORT")) || 5_009;
const DB_PATH = Deno.env.get("JOURNAL_DB_PATH") || "./backend/data/journal.db";
const RETENTION_DAYS = Number(Deno.env.get("JOURNAL_RETENTION_DAYS")) || 90;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1_000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ── Database setup ─────────────────────────────────────────────────────────────

await Deno.mkdir(DB_PATH.substring(0, DB_PATH.lastIndexOf("/")), { recursive: true }).catch(() => {});
const db = new DB(DB_PATH);

db.query(`CREATE TABLE IF NOT EXISTS journal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT UNIQUE,
  event_type TEXT NOT NULL,
  ts INTEGER NOT NULL,
  user_id TEXT,
  algo TEXT,
  instrument TEXT,
  side TEXT,
  order_id TEXT,
  child_id TEXT,
  quantity REAL,
  limit_price REAL,
  fill_price REAL,
  filled_qty REAL,
  market_price REAL,
  market_impact_bps REAL,
  algo_params TEXT,
  raw TEXT NOT NULL
);`);

db.query(`CREATE INDEX IF NOT EXISTS idx_journal_ts ON journal(ts);`);
db.query(`CREATE INDEX IF NOT EXISTS idx_journal_order_id ON journal(order_id);`);
db.query(`CREATE INDEX IF NOT EXISTS idx_journal_instrument ON journal(instrument);`);

// ── Ingest from Redpanda ───────────────────────────────────────────────────────

const CONSUME_TOPICS = [
  "orders.submitted",
  "orders.child",
  "orders.filled",
  "orders.expired",
  "user.session",
];

// deno-lint-ignore no-explicit-any
function extractFields(_topic: string, value: any) {
  return {
    event_id: value.childId ?? value.orderId ?? value.token ?? null,
    user_id: value.userId ?? null,
    algo: value.algo ?? null,
    instrument: value.asset ?? null,
    side: value.side ?? null,
    order_id: value.orderId ?? value.parentOrderId ?? null,
    child_id: value.childId ?? null,
    quantity: value.quantity ?? value.requestedQty ?? null,
    limit_price: value.limitPrice ?? null,
    fill_price: value.avgFillPrice ?? value.fillPrice ?? null,
    filled_qty: value.filledQty ?? null,
    market_price: value.marketPrice ?? null,
    market_impact_bps: value.marketImpactBps ?? null,
    algo_params: value.algoParams ? JSON.stringify(value.algoParams) : null,
  };
}

// deno-lint-ignore no-explicit-any
function ingest(topic: string, value: any) {
  const ts = value.ts ?? Date.now();
  const fields = extractFields(topic, value);

  try {
    db.query(
      `INSERT OR IGNORE INTO journal
        (event_id, event_type, ts, user_id, algo, instrument, side, order_id, child_id,
         quantity, limit_price, fill_price, filled_qty, market_price, market_impact_bps, algo_params, raw)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        fields.event_id, topic, ts, fields.user_id, fields.algo, fields.instrument, fields.side,
        fields.order_id, fields.child_id, fields.quantity, fields.limit_price, fields.fill_price,
        fields.filled_qty, fields.market_price, fields.market_impact_bps, fields.algo_params,
        JSON.stringify(value),
      ],
    );

    // Purge entries outside retention window
    db.query("DELETE FROM journal WHERE ts < ?;", [Date.now() - RETENTION_MS]);
  } catch {
    // best-effort — duplicate event_id will be silently ignored by INSERT OR IGNORE
  }
}

createConsumer("journal-group", CONSUME_TOPICS).then((consumer) => {
  consumer.onMessage((topic, value) => {
    ingest(topic, value as Record<string, unknown>);
  });
  console.log(`[journal] Subscribed to: ${CONSUME_TOPICS.join(", ")}`);
}).catch((err) => {
  console.warn("[journal] Redpanda unavailable, no audit events will be captured:", err.message);
});

// ── HTTP handlers ──────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function rowToEntry(row: unknown[]) {
  const [id, event_id, event_type, ts, user_id, algo, instrument, side, order_id, child_id,
    quantity, limit_price, fill_price, filled_qty, market_price, market_impact_bps, algo_params, raw] = row;
  return {
    id, event_id, event_type, ts, user_id, algo, instrument, side, order_id, child_id,
    quantity, limit_price, fill_price, filled_qty, market_price, market_impact_bps,
    algo_params: algo_params ? (() => { try { return JSON.parse(algo_params as string); } catch { return null; } })() : null,
    raw: raw ? (() => { try { return JSON.parse(raw as string); } catch { return null; } })() : null,
  };
}

function handle(req: Request): Response {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "GET" && path === "/health") {
    return json({ service: "journal", status: "ok", retentionDays: RETENTION_DAYS });
  }

  // GET /journal?from=&to=&userId=&instrument=&orderId=&algo=&limit=&offset=
  if (req.method === "GET" && path === "/journal") {
    const from = Number(url.searchParams.get("from") ?? 0);
    const to = Number(url.searchParams.get("to") ?? Date.now());
    const userId = url.searchParams.get("userId");
    const instrument = url.searchParams.get("instrument");
    const orderId = url.searchParams.get("orderId");
    const algo = url.searchParams.get("algo");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 1000);
    const offset = Number(url.searchParams.get("offset") ?? 0);

    const conditions: string[] = ["ts >= ? AND ts <= ?"];
    const params: (string | number)[] = [from, to];

    if (userId) { conditions.push("user_id = ?"); params.push(userId); }
    if (instrument) { conditions.push("instrument = ?"); params.push(instrument); }
    if (orderId) { conditions.push("order_id = ?"); params.push(orderId); }
    if (algo) { conditions.push("algo = ?"); params.push(algo); }

    params.push(limit, offset);

    const rows = [...db.query(
      `SELECT id, event_id, event_type, ts, user_id, algo, instrument, side, order_id, child_id,
              quantity, limit_price, fill_price, filled_qty, market_price, market_impact_bps, algo_params, raw
       FROM journal
       WHERE ${conditions.join(" AND ")}
       ORDER BY ts DESC
       LIMIT ? OFFSET ?;`,
      params,
    )];

    const total = [...db.query(
      `SELECT COUNT(*) FROM journal WHERE ${conditions.slice(0, -0).join(" AND ")};`,
      params.slice(0, -2),
    )][0][0];

    return json({ total, limit, offset, entries: rows.map(rowToEntry) });
  }

  // GET /journal/order/:orderId — full lifecycle for one order
  const orderMatch = path.match(/^\/journal\/order\/([^/]+)$/);
  if (req.method === "GET" && orderMatch) {
    const orderId = orderMatch[1];
    const rows = [...db.query(
      `SELECT id, event_id, event_type, ts, user_id, algo, instrument, side, order_id, child_id,
              quantity, limit_price, fill_price, filled_qty, market_price, market_impact_bps, algo_params, raw
       FROM journal
       WHERE order_id = ?
       ORDER BY ts ASC;`,
      [orderId],
    )];
    return json({ orderId, entries: rows.map(rowToEntry) });
  }

  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
}

console.log(`📋 Journal service running on port ${PORT} (retention: ${RETENTION_DAYS} days)`);
serve(handle, { port: PORT });

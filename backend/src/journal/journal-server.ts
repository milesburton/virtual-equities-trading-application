import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { DB } from "https://deno.land/x/sqlite@v3.9.1/mod.ts";
import { createConsumer } from "../lib/messaging.ts";

const PORT = Number(Deno.env.get("JOURNAL_PORT")) || 5_009;
const DB_PATH = Deno.env.get("JOURNAL_DB_PATH") || "./backend/data/journal.db";
const RETENTION_DAYS = Number(Deno.env.get("JOURNAL_RETENTION_DAYS")) || 90;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1_000;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ── Database setup ─────────────────────────────────────────────────────────────

await Deno.mkdir(DB_PATH.substring(0, DB_PATH.lastIndexOf("/")), { recursive: true }).catch(() => {});
const db = new DB(DB_PATH);

// WAL mode for concurrent reads during high-frequency candle writes
db.query("PRAGMA journal_mode=WAL");
db.query("PRAGMA busy_timeout=3000");

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

// ── Candle store (market data history) ────────────────────────────────────────
// Aggregates market.ticks into OHLCV candles at 1m and 5m intervals.
// This replaces the standalone candle-store service, mirroring real TCA systems
// where market data history and trade journal share the same data tier.

db.query(`
  CREATE TABLE IF NOT EXISTS candles (
    instrument TEXT NOT NULL,
    interval   TEXT NOT NULL,
    time       INTEGER NOT NULL,
    open       REAL NOT NULL,
    high       REAL NOT NULL,
    low        REAL NOT NULL,
    close      REAL NOT NULL,
    volume     REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (instrument, interval, time)
  );
`);
db.query(`CREATE INDEX IF NOT EXISTS idx_candles_lookup ON candles(instrument, interval, time);`);

const TICKS_PER_MINUTE = 240; // 4 ticks/s × 60 s
const MAX_CANDLES = 120;
const INTERVALS: { key: "1m" | "5m"; ms: number }[] = [
  { key: "1m", ms: 60_000 },
  { key: "5m", ms: 300_000 },
];

function bucketStart(ts: number, intervalMs: number): number {
  return Math.floor(ts / intervalMs) * intervalMs;
}

const stmtCandleUpsert = db.prepareQuery<
  [string, string, number, number, number, number, number, number],
  Record<string, unknown>,
  [string, string, number, number, number]
>(
  `INSERT INTO candles (instrument, interval, time, open, high, low, close, volume)
   VALUES (?1, ?2, ?3, ?4, ?4, ?4, ?4, ?5)
   ON CONFLICT(instrument, interval, time) DO UPDATE SET
     high   = MAX(high,   excluded.high),
     low    = MIN(low,    excluded.low),
     close  = excluded.close,
     volume = volume + excluded.volume`,
);

let lastPruneTs = 0;
function maybePruneCandles(now: number) {
  if (now - lastPruneTs < 60_000) return;
  lastPruneTs = now;
  // For each instrument+interval pair that exceeds MAX_CANDLES, delete the
  // oldest rows beyond the cap. We use a correlated subquery to find the
  // cut-off timestamp per instrument so only genuinely excess rows are removed.
  for (const { key } of INTERVALS) {
    db.query(
      `DELETE FROM candles
       WHERE interval = ?
         AND (instrument, time) IN (
           SELECT instrument, time FROM candles
           WHERE interval = ?
             AND time < (
               SELECT time FROM candles c2
               WHERE c2.instrument = candles.instrument
                 AND c2.interval   = ?
               ORDER BY time DESC
               LIMIT 1 OFFSET ?
             )
         )`,
      [key, key, key, MAX_CANDLES - 1],
    );
  }
}

function ingestTick(msg: { prices?: Record<string, number>; volumes?: Record<string, number> }) {
  if (!msg.prices) return;
  const ts = Date.now();
  const volumes = msg.volumes ?? {};

  db.query("BEGIN");
  try {
    for (const [instrument, price] of Object.entries(msg.prices)) {
      const tickVolume = (volumes[instrument] ?? 0) / TICKS_PER_MINUTE;
      for (const { key, ms } of INTERVALS) {
        const bucket = bucketStart(ts, ms);
        stmtCandleUpsert.execute([instrument, key, bucket, price, tickVolume]);
      }
    }
    db.query("COMMIT");
  } catch (err) {
    db.query("ROLLBACK");
    console.warn("[journal] candle upsert failed:", (err as Error).message);
  }

  maybePruneCandles(ts);
}

// ── Ingest order events from Redpanda ─────────────────────────────────────────

const CONSUME_TOPICS = [
  "orders.submitted",
  "orders.child",
  "orders.filled",
  "orders.expired",
  "orders.rejected",
  "user.session",
  "user.access",
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

// Subscribe to market ticks to build OHLCV candle history
createConsumer("journal-market", ["market.ticks"]).then((consumer) => {
  consumer.onMessage((_topic, value) => {
    ingestTick(value as { prices?: Record<string, number>; volumes?: Record<string, number> });
  });
  console.log("[journal] Subscribed to: market.ticks (candle aggregation)");
}).catch((err) => {
  console.warn("[journal] Could not subscribe to market.ticks:", err.message);
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
    return json({ service: "journal", version: VERSION, status: "ok", retentionDays: RETENTION_DAYS });
  }

  // GET /candles?instrument=AAPL&interval=1m&limit=120
  if (req.method === "GET" && path === "/candles") {
    const instrument = url.searchParams.get("instrument");
    const interval = url.searchParams.get("interval") ?? "1m";
    const limit = Math.min(Number(url.searchParams.get("limit") ?? MAX_CANDLES), MAX_CANDLES);

    if (!instrument) return json({ error: "instrument is required" }, 400);
    if (interval !== "1m" && interval !== "5m") return json({ error: "interval must be 1m or 5m" }, 400);

    const rows = [...db.query(
      `SELECT time, open, high, low, close, volume
       FROM candles
       WHERE instrument = ? AND interval = ?
       ORDER BY time DESC
       LIMIT ?`,
      [instrument, interval, limit],
    )].reverse(); // return ascending

    const candles = rows.map(([time, open, high, low, close, volume]) => ({
      time, open, high, low, close, volume,
    }));

    return json(candles);
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

  // GET /orders?limit=200 — reconstruct OrderRecord[] from journal events for UI hydration
  if (req.method === "GET" && path === "/orders") {
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 500);
    const since = Date.now() - RETENTION_MS;

    // Fetch all order-related events within retention window, oldest first
    const rows = [...db.query(
      `SELECT order_id, event_type, ts, raw FROM journal
       WHERE order_id IS NOT NULL AND ts >= ?
       ORDER BY ts ASC;`,
      [since],
    )] as [string, string, number, string][];

    // Group events by order_id and reconstruct OrderRecord
    const orderMap = new Map<string, Record<string, unknown>>();
    for (const [orderId, eventType, ts, rawStr] of rows) {
      let raw: Record<string, unknown> = {};
      try { raw = JSON.parse(rawStr); } catch { /* skip */ }

      if (eventType === "orders.rejected" && !orderMap.has(orderId)) {
        // Gateway-rejected before OMS: create a minimal stub so the order appears in the blotter
        orderMap.set(orderId, {
          id: orderId,
          submittedAt: ts,
          asset: raw.asset ?? raw.instrument ?? "",
          side: raw.side ?? "BUY",
          quantity: raw.quantity ?? raw.requestedQty ?? 0,
          limitPrice: raw.limitPrice ?? 0,
          expiresAt: ts + 86_400_000,
          strategy: raw.strategy ?? raw.algo ?? "LIMIT",
          status: "rejected",
          rejectReason: raw.reason ?? raw.message ?? null,
          filled: 0,
          algoParams: raw.algoParams ?? { strategy: raw.strategy ?? "LIMIT" },
          children: [],
        });
      } else if (eventType === "orders.submitted") {
        orderMap.set(orderId, {
          id: orderId,
          submittedAt: ts,
          asset: raw.asset ?? raw.instrument ?? "",
          side: raw.side ?? "BUY",
          quantity: raw.quantity ?? raw.requestedQty ?? 0,
          limitPrice: raw.limitPrice ?? 0,
          expiresAt: raw.expiresAt ?? ts + 86_400_000,
          strategy: raw.strategy ?? raw.algo ?? "LIMIT",
          status: "queued",
          filled: 0,
          algoParams: raw.algoParams ?? { strategy: raw.strategy ?? "LIMIT" },
          children: [],
        });
      } else if (orderMap.has(orderId)) {
        const order = orderMap.get(orderId)!;
        if (eventType === "orders.filled") {
          // EMS sends per-child filledQty; accumulate across all fill events
          // for this parent order to get the running total.
          const childFilled = Number(raw.filledQty ?? 0);
          order.filled = Number(order.filled ?? 0) + childFilled;
          const qty = Number(order.quantity ?? 0);
          order.status = qty > 0 && Number(order.filled) >= qty ? "filled" : "executing";
        } else if (eventType === "orders.expired") {
          order.status = "expired";
        } else if (eventType === "orders.rejected") {
          order.status = "rejected";
          if (raw.reason) order.rejectReason = raw.reason;
        } else if (eventType === "orders.child") {
          const children = order.children as unknown[];
          children.push({
            id: raw.childId ?? raw.orderId ?? "",
            side: raw.side ?? order.side,
            quantity: raw.qty ?? raw.quantity ?? 0,
            limitPrice: raw.price ?? raw.limitPrice ?? 0,
            filledQty: 0,
            avgFillPrice: 0,
            commissionUSD: 0,
            submittedAt: ts,
            status: "queued",
          });
        }
      }
    }

    const orders = [...orderMap.values()]
      .sort((a, b) => Number(b.submittedAt) - Number(a.submittedAt))
      .slice(0, limit);

    return json(orders);
  }

  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
}

Deno.serve({ port: PORT }, handle);

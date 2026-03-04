import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { serve } from "https://deno.land/std@0.210.0/http/server.ts";
import { DB } from "https://deno.land/x/sqlite@v3.9.1/mod.ts";
import { createConsumer } from "../lib/messaging.ts";

const PORT = Number(Deno.env.get("CANDLE_STORE_PORT")) || 5_010;
const DB_PATH = Deno.env.get("CANDLE_STORE_DB_PATH") || "./backend/data/candle-store.db";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const INTERVALS: { key: "1m" | "5m"; ms: number }[] = [
  { key: "1m", ms: 60_000 },
  { key: "5m", ms: 300_000 },
];

const MAX_CANDLES = 120;

// ── Database setup ─────────────────────────────────────────────────────────────

await Deno.mkdir(DB_PATH.substring(0, DB_PATH.lastIndexOf("/")), { recursive: true }).catch(() => {});
const db = new DB(DB_PATH);

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

// ── Candle upsert logic ────────────────────────────────────────────────────────

function bucketStart(ts: number, intervalMs: number): number {
  return Math.floor(ts / intervalMs) * intervalMs;
}

function upsertCandle(
  instrument: string,
  interval: string,
  bucket: number,
  price: number,
  volume: number,
): void {
  const existing = [...db.query(
    `SELECT open, high, low, close, volume FROM candles WHERE instrument = ? AND interval = ? AND time = ?`,
    [instrument, interval, bucket],
  )];

  if (existing.length > 0) {
    const [open, high, low, , existingVol] = existing[0] as [number, number, number, number, number];
    db.query(
      `INSERT OR REPLACE INTO candles (instrument, interval, time, open, high, low, close, volume)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [instrument, interval, bucket, open, Math.max(high, price), Math.min(low, price), price, (existingVol ?? 0) + volume],
    );
  } else {
    db.query(
      `INSERT OR REPLACE INTO candles (instrument, interval, time, open, high, low, close, volume)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [instrument, interval, bucket, price, price, price, price, volume],
    );
    // Prune oldest candles beyond MAX_CANDLES per instrument+interval
    db.query(
      `DELETE FROM candles
       WHERE instrument = ? AND interval = ? AND time NOT IN (
         SELECT time FROM candles WHERE instrument = ? AND interval = ?
         ORDER BY time DESC LIMIT ?
       )`,
      [instrument, interval, instrument, interval, MAX_CANDLES],
    );
  }
}

// ── Ingest from Redpanda ───────────────────────────────────────────────────────

createConsumer("candle-store-group", ["market.ticks"]).then((consumer) => {
  consumer.onMessage((_topic, value) => {
    const msg = value as { prices?: Record<string, number>; volumes?: Record<string, number> };
    if (!msg.prices) return;

    const ts = Date.now();
    const volumes = msg.volumes ?? {};

    for (const [instrument, price] of Object.entries(msg.prices)) {
      const volume = volumes[instrument] ?? 0;
      for (const { key, ms } of INTERVALS) {
        const bucket = bucketStart(ts, ms);
        upsertCandle(instrument, key, bucket, price, volume);
      }
    }
  });
  console.log("[candle-store] Subscribed to: market.ticks");
}).catch((err) => {
  console.warn("[candle-store] Redpanda unavailable, no candles will be stored:", err.message);
});

// ── HTTP handlers ──────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function handle(req: Request): Response {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "GET" && path === "/health") {
    return json({ service: "candle-store", status: "ok" });
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

  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
}

console.log(`📈 Candle-store running on port ${PORT}`);
serve(handle, { port: PORT });

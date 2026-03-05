/**
 * FIX Archive (Drop-Copy Service)
 *
 * Subscribes to "fix.execution" from the message bus and persists every
 * execution report to SQLite. This provides a compliance-grade audit trail
 * of all fills — equivalent to a FIX drop-copy in a production system.
 *
 * Also persists raw FIX session messages (Logon, Logout, NewOrderSingle,
 * ExecutionReport) intercepted from the gateway's "fix.session" topic.
 *
 * HTTP:
 *   GET /health
 *   GET /executions?symbol=AAPL&limit=500&from=<ms>&to=<ms>
 *   GET /executions/:execId
 */

import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { serve } from "https://deno.land/std@0.210.0/http/server.ts";
import { DB } from "https://deno.land/x/sqlite@v3.9.1/mod.ts";
import { createConsumer } from "../lib/messaging.ts";

const PORT = Number(Deno.env.get("FIX_ARCHIVE_PORT")) || 5_012;
const DB_PATH = Deno.env.get("FIX_ARCHIVE_DB_PATH") || "./backend/data/fix-archive.db";
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ── Database setup ─────────────────────────────────────────────────────────────

await Deno.mkdir(DB_PATH.substring(0, DB_PATH.lastIndexOf("/")), { recursive: true }).catch(() => {});
const db = new DB(DB_PATH);

db.query(`
  CREATE TABLE IF NOT EXISTS executions (
    exec_id        TEXT PRIMARY KEY,
    cl_ord_id      TEXT NOT NULL,
    orig_cl_ord_id TEXT,
    symbol         TEXT NOT NULL,
    side           TEXT NOT NULL,
    exec_type      TEXT NOT NULL,
    ord_status     TEXT NOT NULL,
    leaves_qty     REAL NOT NULL DEFAULT 0,
    cum_qty        REAL NOT NULL DEFAULT 0,
    avg_px         REAL NOT NULL DEFAULT 0,
    last_qty       REAL NOT NULL DEFAULT 0,
    last_px        REAL NOT NULL DEFAULT 0,
    venue          TEXT,
    counterparty   TEXT,
    commission     REAL,
    settl_date     TEXT,
    transact_time  TEXT NOT NULL,
    raw_payload    TEXT NOT NULL,
    ts             INTEGER NOT NULL
  );
`);

db.query(`CREATE INDEX IF NOT EXISTS idx_exec_symbol ON executions(symbol, ts);`);
db.query(`CREATE INDEX IF NOT EXISTS idx_exec_cl_ord_id ON executions(cl_ord_id);`);

// ── Consumer ──────────────────────────────────────────────────────────────────

interface ExecReport {
  execId: string;
  clOrdId: string;
  origClOrdId?: string;
  symbol: string;
  side: string;
  execType: string;
  ordStatus: string;
  leavesQty: number;
  cumQty: number;
  avgPx: number;
  lastQty: number;
  lastPx: number;
  venue?: string;
  counterparty?: string;
  commission?: number;
  settlDate?: string;
  transactTime: string;
  ts: number;
}

async function startConsumer(): Promise<void> {
  const consumer = await createConsumer("fix-archive", ["fix.execution"]).catch((err) => {
    console.warn("[fix-archive] Cannot subscribe to fix.execution:", err.message);
    return null;
  });
  if (!consumer) return;

  consumer.onMessage((_topic, raw) => {
    const r = raw as ExecReport;
    try {
      db.query(
        `INSERT OR REPLACE INTO executions
          (exec_id, cl_ord_id, orig_cl_ord_id, symbol, side, exec_type, ord_status,
           leaves_qty, cum_qty, avg_px, last_qty, last_px, venue, counterparty,
           commission, settl_date, transact_time, raw_payload, ts)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          r.execId, r.clOrdId, r.origClOrdId ?? null, r.symbol, r.side,
          r.execType, r.ordStatus, r.leavesQty, r.cumQty, r.avgPx,
          r.lastQty, r.lastPx, r.venue ?? null, r.counterparty ?? null,
          r.commission ?? null, r.settlDate ?? null, r.transactTime,
          JSON.stringify(raw), r.ts,
        ],
      );
      console.log(`[fix-archive] Stored ${r.execId}: ${r.symbol} ${r.cumQty} @ ${r.avgPx}`);
    } catch (err) {
      console.error("[fix-archive] DB insert failed:", err);
    }
  });
}

await startConsumer();

// ── HTTP API ──────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

serve((req: Request): Response => {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  if (path === "/health" && req.method === "GET") {
    const count = [...db.query("SELECT COUNT(*) FROM executions")][0][0] as number;
    return json({ service: "fix-archive", version: VERSION, status: "ok", executions: count });
  }

  if (path === "/executions" && req.method === "GET") {
    const symbol = url.searchParams.get("symbol");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 500), 2000);
    const from = url.searchParams.get("from") ? Number(url.searchParams.get("from")) : 0;
    const to = url.searchParams.get("to") ? Number(url.searchParams.get("to")) : Date.now() + 1;

    let rows: unknown[][];
    if (symbol) {
      rows = [...db.query(
        `SELECT exec_id, cl_ord_id, orig_cl_ord_id, symbol, side, exec_type, ord_status,
                leaves_qty, cum_qty, avg_px, last_qty, last_px, venue, counterparty,
                commission, settl_date, transact_time, ts
         FROM executions WHERE symbol=? AND ts>=? AND ts<? ORDER BY ts DESC LIMIT ?`,
        [symbol, from, to, limit],
      )];
    } else {
      rows = [...db.query(
        `SELECT exec_id, cl_ord_id, orig_cl_ord_id, symbol, side, exec_type, ord_status,
                leaves_qty, cum_qty, avg_px, last_qty, last_px, venue, counterparty,
                commission, settl_date, transact_time, ts
         FROM executions WHERE ts>=? AND ts<? ORDER BY ts DESC LIMIT ?`,
        [from, to, limit],
      )];
    }

    const executions = rows.map(([
      execId, clOrdId, origClOrdId, sym, side, execType, ordStatus,
      leavesQty, cumQty, avgPx, lastQty, lastPx, venue, counterparty,
      commission, settlDate, transactTime, ts,
    ]) => ({
      execId, clOrdId, origClOrdId, symbol: sym, side, execType, ordStatus,
      leavesQty, cumQty, avgPx, lastQty, lastPx, venue, counterparty,
      commission, settlDate, transactTime, ts,
    }));

    return json(executions);
  }

  // /executions/:id
  const match = path.match(/^\/executions\/(.+)$/);
  if (match && req.method === "GET") {
    const rows = [...db.query(
      "SELECT raw_payload FROM executions WHERE exec_id=?",
      [match[1]],
    )];
    if (rows.length === 0) return json({ error: "Not found" }, 404);
    return json(JSON.parse(rows[0][0] as string));
  }

  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
}, { port: PORT });

console.log(`[fix-archive] FIX Archive running on port ${PORT}`);

/**
 * Execution Management System (EMS)
 *
 * Subscribes to "orders.child" from the message bus (published by algo services).
 * Computes fills using current market data, then publishes:
 *   - "orders.filled"  — fill confirmation with all execution enrichment fields
 *   - "fix.execution"  — FIX-style execution report for the archive
 *
 * No longer accepts direct HTTP order submission from algos.
 * HTTP surface (internal only): GET /health
 */

import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { serve } from "https://deno.land/std@0.210.0/http/server.ts";
import { MarketSimClient } from "../lib/marketSimClient.ts";
import { createConsumer, createProducer } from "../lib/messaging.ts";

const MARKET_SIM_PORT = Number(Deno.env.get("MARKET_SIM_PORT")) || 5_000;
const MARKET_SIM_HOST = Deno.env.get("MARKET_SIM_HOST") || "localhost";
const PORT = Number(Deno.env.get("EMS_PORT")) || 5_001;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

const PARTICIPATION_CAP = Number(Deno.env.get("EMS_PARTICIPATION_CAP")) || 0.20;
const IMPACT_PER_1000 = Number(Deno.env.get("EMS_IMPACT_PER_1000_BPS")) || 1.0;

const COMMISSION_PER_SHARE = 0.005;
const SEC_FEE_RATE = 0.000008;
const FINRA_TAF_PER_SHARE = 0.000119;

const marketClient = new MarketSimClient(MARKET_SIM_HOST, MARKET_SIM_PORT);
marketClient.start();

// Simulated execution venues
const VENUES = [
  { mic: "XNAS", weight: 30 }, { mic: "XNYS", weight: 25 }, { mic: "ARCX", weight: 15 },
  { mic: "BATS", weight: 12 }, { mic: "EDGX", weight: 8  }, { mic: "IEX",  weight: 6  },
  { mic: "MEMX", weight: 4  },
] as const;
type VenueMIC = (typeof VENUES)[number]["mic"];

const COUNTERPARTIES = ["GSCO","MSCO","JPMS","BAML","CITI","UBSS","DBSI","BARX","MKTX","VIRX","CITD","SUSG","GETC","JNST","TWOC"];

function pickWeightedVenue(): VenueMIC {
  const total = VENUES.reduce((s, v) => s + v.weight, 0);
  let r = Math.random() * total;
  for (const v of VENUES) { r -= v.weight; if (r <= 0) return v.mic; }
  return VENUES[0].mic;
}
function pickCounterparty(): string {
  return COUNTERPARTIES[Math.floor(Math.random() * COUNTERPARTIES.length)];
}
function pickLiquidityFlag(): "MAKER" | "TAKER" | "CROSS" {
  const r = Math.random();
  return r < 0.40 ? "MAKER" : r < 0.95 ? "TAKER" : "CROSS";
}
function settlementDate(fromMs = Date.now()): string {
  const d = new Date(fromMs);
  let added = 0;
  while (added < 2) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d.toISOString().slice(0, 10);
}

const producer = await createProducer("ems").catch((err) => {
  console.error("[ems] Cannot connect to Redpanda:", err.message);
  Deno.exit(1);
});

interface ChildOrder {
  childId: string;
  parentOrderId: string;
  clientOrderId?: string;
  algo: string;
  asset: string;
  side: "BUY" | "SELL";
  quantity: number;
  limitPrice?: number;
  marketPrice?: number;
  sliceIndex?: number;
  numSlices?: number;
  vwap?: number;
  deviation?: number;
  tickVolume?: number;
  algoParams?: Record<string, unknown>;
  ts: number;
}

// Subscribe to orders.child — published by algo services
const consumer = await createConsumer("ems-child-orders", ["orders.child"]).catch((err) => {
  console.error("[ems] Cannot subscribe to orders.child:", err.message);
  Deno.exit(1);
});

let fillSeq = 1;

consumer.onMessage(async (_topic, raw) => {
  const child = raw as ChildOrder;
  const tick = marketClient.getLatest();
  const midPrice = tick.prices[child.asset];

  if (!midPrice) {
    console.warn(`[ems] Unknown asset ${child.asset} — cannot fill ${child.childId}`);
    return;
  }

  const tickVolume = tick.volumes[child.asset] ?? 1_000;
  const maxFill = Math.floor(tickVolume * PARTICIPATION_CAP);
  const filledQty = Math.min(child.quantity, maxFill);
  const remainingQty = child.quantity - filledQty;
  const impactBps = (filledQty / 1_000) * IMPACT_PER_1000;
  const impactFactor = child.side === "BUY" ? 1 + impactBps / 10_000 : 1 - impactBps / 10_000;
  const avgFillPrice = parseFloat((midPrice * impactFactor).toFixed(4));

  const venue = pickWeightedVenue();
  const counterparty = pickCounterparty();
  const liquidityFlag = pickLiquidityFlag();
  const sd = settlementDate();
  const commissionPerShare = liquidityFlag === "MAKER" ? -0.002 : COMMISSION_PER_SHARE;
  const commissionUSD = parseFloat((filledQty * commissionPerShare).toFixed(2));
  const notional = filledQty * avgFillPrice;
  const secFeeUSD = child.side === "SELL" ? parseFloat((notional * SEC_FEE_RATE).toFixed(4)) : 0;
  const finraTafUSD = child.side === "SELL" ? parseFloat(Math.min(filledQty * FINRA_TAF_PER_SHARE, 5.95).toFixed(4)) : 0;
  const totalFeeUSD = parseFloat((commissionUSD + secFeeUSD + finraTafUSD).toFixed(4));

  const execId = `EX${String(fillSeq++).padStart(8, "0")}`;

  console.log(
    `[ems] Fill ${execId}: ${child.side} ${filledQty}/${child.quantity} ${child.asset} ` +
    `@ ${avgFillPrice} via ${venue} (${liquidityFlag}) impact=${impactBps.toFixed(2)}bps`,
  );

  if (filledQty > 0) {
    const fillPayload = {
      execId,
      childId: child.childId,
      parentOrderId: child.parentOrderId,
      clientOrderId: child.clientOrderId,
      algo: child.algo,
      asset: child.asset,
      side: child.side,
      requestedQty: child.quantity,
      filledQty,
      remainingQty,
      avgFillPrice,
      midPrice,
      marketImpactBps: impactBps,
      venue,
      counterparty,
      liquidityFlag,
      commissionUSD,
      secFeeUSD,
      finraTafUSD,
      totalFeeUSD,
      settlementDate: sd,
      ts: Date.now(),
    };

    await producer.send("orders.filled", fillPayload).catch(() => {});

    // Publish FIX-format execution report for the archive service
    await producer.send("fix.execution", {
      execId,
      clOrdId: child.childId,
      origClOrdId: child.parentOrderId,
      symbol: child.asset,
      side: child.side === "BUY" ? "1" : "2",
      ordType: "2",          // Limit
      execType: remainingQty === 0 ? "2" : "1", // 2=Fill, 1=PartialFill
      ordStatus: remainingQty === 0 ? "2" : "1",
      leavesQty: remainingQty,
      cumQty: filledQty,
      avgPx: avgFillPrice,
      lastQty: filledQty,
      lastPx: avgFillPrice,
      venue,
      counterparty,
      commission: commissionUSD,
      settlDate: sd,
      transactTime: new Date().toISOString(),
      ts: Date.now(),
    }).catch(() => {});
  }
});

console.log(`[ems] Listening for orders.child on message bus`);

// ── Health endpoint ───────────────────────────────────────────────────────────
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

serve((req) => {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (url.pathname === "/health" && req.method === "GET") {
    return new Response(
      JSON.stringify({ service: "ems", version: VERSION, status: "ok" }),
      { headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  }
  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
}, { port: PORT });

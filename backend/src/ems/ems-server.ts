import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { serve } from "https://deno.land/std@0.210.0/http/server.ts";
import { MarketSimClient } from "../lib/marketSimClient.ts";
import { createProducer } from "../lib/messaging.ts";

const MARKET_SIM_PORT = Number(Deno.env.get("MARKET_SIM_PORT")) || 5_000;
const MARKET_SIM_HOST = Deno.env.get("MARKET_SIM_HOST") || "localhost";

const marketClient = new MarketSimClient(MARKET_SIM_HOST, MARKET_SIM_PORT);
marketClient.start();

const PARTICIPATION_CAP = Number(Deno.env.get("EMS_PARTICIPATION_CAP")) || 0.20;
const IMPACT_PER_1000 = Number(Deno.env.get("EMS_IMPACT_PER_1000_BPS")) || 1.0;

// Commission model: $0.005/share (SEC fee: $0.000008 × notional, rounded to $0.01 minimum)
const COMMISSION_PER_SHARE = 0.005;
const SEC_FEE_RATE = 0.000008; // $8 per $1M notional (SEC Section 31 fee)
const FINRA_TAF_PER_SHARE = 0.000119; // $0.000119/share FINRA TAF (capped at $5.95 per trade)

// Simulated execution venues with realistic routing weights
const VENUES = [
  { mic: "XNAS",  name: "NASDAQ",          weight: 30 },
  { mic: "XNYS",  name: "NYSE",            weight: 25 },
  { mic: "ARCX",  name: "NYSE Arca",       weight: 15 },
  { mic: "BATS",  name: "CBOE BZX",        weight: 12 },
  { mic: "EDGX",  name: "CBOE EDGX",       weight: 8  },
  { mic: "IEX",   name: "IEX",             weight: 6  },
  { mic: "MEMX",  name: "MEMX",            weight: 4  },
] as const;

// Simulated counterparty MPIDs (market participant IDs)
const COUNTERPARTIES = [
  "GSCO",  // Goldman Sachs
  "MSCO",  // Morgan Stanley
  "JPMS",  // JP Morgan
  "BAML",  // Bank of America Merrill Lynch
  "CITI",  // Citigroup
  "UBSS",  // UBS Securities
  "DBSI",  // Deutsche Bank
  "BARX",  // Barclays Capital
  "MKTX",  // MarketAxess (HFT / market maker)
  "VIRX",  // Virtu Financial
  "CITD",  // Citadel Securities
  "SUSG",  // Susquehanna
  "GETC",  // GTS (market maker)
  "JNST",  // Jane Street
  "TWOC",  // Two Sigma
];

type VenueMIC = (typeof VENUES)[number]["mic"];

function pickWeightedVenue(): { mic: VenueMIC; name: string } {
  const total = VENUES.reduce((s, v) => s + v.weight, 0);
  let r = Math.random() * total;
  for (const v of VENUES) {
    r -= v.weight;
    if (r <= 0) return { mic: v.mic, name: v.name };
  }
  return { mic: VENUES[0].mic, name: VENUES[0].name };
}

function pickCounterparty(): string {
  return COUNTERPARTIES[Math.floor(Math.random() * COUNTERPARTIES.length)];
}

/** T+2 settlement date as ISO date string, skipping weekends. */
function settlementDate(fromMs: number = Date.now()): string {
  const d = new Date(fromMs);
  let daysAdded = 0;
  while (daysAdded < 2) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) daysAdded++; // skip Sat(6)/Sun(0)
  }
  return d.toISOString().slice(0, 10);
}

/** Liquidity flag: ~40% maker (passive resting orders), 55% taker, 5% cross. */
function pickLiquidityFlag(): "MAKER" | "TAKER" | "CROSS" {
  const r = Math.random();
  if (r < 0.40) return "MAKER";
  if (r < 0.95) return "TAKER";
  return "CROSS";
}

interface FillResult {
  filledQty: number;
  remainingQty: number;
  avgFillPrice: number;
  marketImpactBps: number;
  // ── Execution enrichment ──────────────────────────────────────────────────────
  venue: VenueMIC;
  venueName: string;
  counterparty: string;
  liquidityFlag: "MAKER" | "TAKER" | "CROSS";
  commissionUSD: number;
  secFeeUSD: number;
  finraTafUSD: number;
  totalFeeUSD: number;
  settlementDate: string;
}

function computeFill(
  requestedQty: number,
  side: "BUY" | "SELL",
  midPrice: number,
  tickVolume: number,
): FillResult {
  const maxFill = Math.floor(tickVolume * PARTICIPATION_CAP);
  const filledQty = Math.min(requestedQty, maxFill);
  const remainingQty = requestedQty - filledQty;
  const impactBps = (filledQty / 1_000) * IMPACT_PER_1000;
  const impactFactor = side === "BUY" ? 1 + impactBps / 10_000 : 1 - impactBps / 10_000;
  const avgFillPrice = parseFloat((midPrice * impactFactor).toFixed(4));

  const venue = pickWeightedVenue();
  const counterparty = pickCounterparty();
  const liquidityFlag = pickLiquidityFlag();
  const sd = settlementDate();

  // Commission: maker fills get a small rebate (-$0.002/share), taker pays $0.005/share
  const commissionPerShare = liquidityFlag === "MAKER" ? -0.002 : COMMISSION_PER_SHARE;
  const commissionUSD = parseFloat((filledQty * commissionPerShare).toFixed(2));
  const notional = filledQty * avgFillPrice;
  const secFeeUSD = side === "SELL" ? parseFloat((notional * SEC_FEE_RATE).toFixed(4)) : 0; // SEC fee only on sells
  const finraTafUSD = side === "SELL" ? parseFloat(Math.min(filledQty * FINRA_TAF_PER_SHARE, 5.95).toFixed(4)) : 0;
  const totalFeeUSD = parseFloat((commissionUSD + secFeeUSD + finraTafUSD).toFixed(4));

  return {
    filledQty,
    remainingQty,
    avgFillPrice,
    marketImpactBps: impactBps,
    venue: venue.mic,
    venueName: venue.name,
    counterparty,
    liquidityFlag,
    commissionUSD,
    secFeeUSD,
    finraTafUSD,
    totalFeeUSD,
    settlementDate: sd,
  };
}

interface TradeRequest {
  asset: string;
  side: "BUY" | "SELL";
  quantity: number;
}

interface TradeResponse {
  success: boolean;
  message: string;
  filledQty: number;
  remainingQty: number;
  avgFillPrice: number;
  marketImpactBps: number;
  totalCost: number;
  price?: number;
  // ── Execution enrichment ────────────────────────────────────────────────────
  venue?: VenueMIC;
  venueName?: string;
  counterparty?: string;
  liquidityFlag?: "MAKER" | "TAKER" | "CROSS";
  commissionUSD?: number;
  secFeeUSD?: number;
  finraTafUSD?: number;
  totalFeeUSD?: number;
  settlementDate?: string;
}

const producer = await createProducer("ems").catch((err) => {
  console.warn("[ems] Redpanda unavailable, fills will not be published to bus:", err.message);
  return null;
});

const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

async function handleTradeRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  if (url.pathname === "/health" && req.method === "GET") {
    return new Response(
      JSON.stringify({ service: "ems", version: VERSION, status: "ok" }),
      { headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  }

  if (req.method !== "POST") {
    return new Response("Only POST requests are allowed", { status: 405, headers: CORS_HEADERS });
  }

  let trade: TradeRequest;
  try {
    trade = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, message: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  }

  const tick = marketClient.getLatest();
  const midPrice = tick.prices[trade.asset];

  if (!midPrice) {
    return new Response(
      JSON.stringify({ success: false, message: `Unknown asset: ${trade.asset}` }),
      { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  }

  const tickVolume = tick.volumes[trade.asset] ?? 1_000;

  const fill = computeFill(trade.quantity, trade.side, midPrice, tickVolume);

  console.log(
    `📊 ${trade.side} ${trade.quantity} ${trade.asset} | price=${midPrice} tickVol=${tickVolume} ` +
    `filled=${fill.filledQty} remaining=${fill.remainingQty} avgFill=${fill.avgFillPrice} ` +
    `impact=${fill.marketImpactBps.toFixed(2)}bps venue=${fill.venue} cpty=${fill.counterparty} ` +
    `liq=${fill.liquidityFlag} comm=$${fill.commissionUSD} total_fee=$${fill.totalFeeUSD} settle=${fill.settlementDate}`,
  );

  // Publish execution report to the bus
  if (fill.filledQty > 0) {
    producer?.send("orders.filled", {
      source: "ems",
      asset: trade.asset,
      side: trade.side,
      requestedQty: trade.quantity,
      filledQty: fill.filledQty,
      remainingQty: fill.remainingQty,
      avgFillPrice: fill.avgFillPrice,
      marketImpactBps: fill.marketImpactBps,
      midPrice,
      tickVolume,
      venue: fill.venue,
      venueName: fill.venueName,
      counterparty: fill.counterparty,
      liquidityFlag: fill.liquidityFlag,
      commissionUSD: fill.commissionUSD,
      secFeeUSD: fill.secFeeUSD,
      finraTafUSD: fill.finraTafUSD,
      totalFeeUSD: fill.totalFeeUSD,
      settlementDate: fill.settlementDate,
      ts: Date.now(),
    }).catch(() => {});
  }

  const response: TradeResponse = {
    success: true,
    message: fill.filledQty > 0
      ? `Filled ${fill.filledQty}/${trade.quantity} ${trade.asset} @ ${fill.avgFillPrice} ` +
        `(${fill.marketImpactBps.toFixed(2)}bps impact, ${fill.venueName}, ${fill.liquidityFlag})`
      : `No fill — insufficient liquidity (tick vol: ${tickVolume})`,
    filledQty: fill.filledQty,
    remainingQty: fill.remainingQty,
    avgFillPrice: fill.avgFillPrice,
    marketImpactBps: fill.marketImpactBps,
    totalCost: fill.filledQty * fill.avgFillPrice,
    price: fill.avgFillPrice,
    venue: fill.venue,
    venueName: fill.venueName,
    counterparty: fill.counterparty,
    liquidityFlag: fill.liquidityFlag,
    commissionUSD: fill.commissionUSD,
    secFeeUSD: fill.secFeeUSD,
    finraTafUSD: fill.finraTafUSD,
    totalFeeUSD: fill.totalFeeUSD,
    settlementDate: fill.settlementDate,
  };

  return new Response(JSON.stringify(response), {
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

const PORT = Number(Deno.env.get("EMS_PORT")) || 5_001;

console.log(`🚀 EMS running on port ${PORT}`);

serve(handleTradeRequest, { port: PORT });

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

const producer = await createProducer("ems").catch((err) => {
  console.warn("[ems] Redpanda unavailable, fills will not be published to bus:", err.message);
  return null;
});

interface FillResult {
  filledQty: number;
  remainingQty: number;
  avgFillPrice: number;
  marketImpactBps: number;
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
  return { filledQty, remainingQty, avgFillPrice, marketImpactBps: impactBps };
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
}

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
    `filled=${fill.filledQty} remaining=${fill.remainingQty} avgFill=${fill.avgFillPrice} impact=${fill.marketImpactBps.toFixed(2)}bps`,
  );

  // Publish execution report to the bus (non-blocking — algos already got the fill via HTTP response)
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
      ts: Date.now(),
    }).catch(() => {});
  }

  const response: TradeResponse = {
    success: true,
    message: fill.filledQty > 0
      ? `Filled ${fill.filledQty}/${trade.quantity} ${trade.asset} @ ${fill.avgFillPrice} (${fill.marketImpactBps.toFixed(2)}bps impact)`
      : `No fill — insufficient liquidity (tick vol: ${tickVolume})`,
    filledQty: fill.filledQty,
    remainingQty: fill.remainingQty,
    avgFillPrice: fill.avgFillPrice,
    marketImpactBps: fill.marketImpactBps,
    totalCost: fill.filledQty * fill.avgFillPrice,
    price: fill.avgFillPrice,
  };

  return new Response(JSON.stringify(response), {
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

const PORT = Number(Deno.env.get("EMS_PORT")) || 5_001;

console.log(`🚀 EMS running on port ${PORT}`);

serve(handleTradeRequest, { port: PORT });

import "https://deno.land/std@0.210.0/dotenv/load.ts";
import type { Trade } from "../types/types.ts";
import { MarketSimClient, type MarketTick } from "../lib/marketSimClient.ts";
import { sendDecisionEvent } from "../observability/client.ts";

const PORT = Number(Deno.env.get("VWAP_ALGO_PORT")) || 5_006;
const EMS_PORT = Number(Deno.env.get("EMS_PORT")) || 5_001;
const EMS_HOST = Deno.env.get("EMS_HOST") || "localhost";
const MARKET_SIM_PORT = Number(Deno.env.get("MARKET_SIM_PORT")) || 5_000;
const MARKET_SIM_HOST = Deno.env.get("MARKET_SIM_HOST") || "localhost";
const VWAP_WINDOW = Number(Deno.env.get("VWAP_WINDOW_TICKS")) || 20;

console.log(`VWAP Algo running on port ${PORT}, window=${VWAP_WINDOW} ticks`);

const marketClient = new MarketSimClient(MARKET_SIM_HOST, MARKET_SIM_PORT);
marketClient.start();

interface PriceVolPoint {
  price: number;
  volume: number;
}

const priceVolHistory = new Map<string, PriceVolPoint[]>();

function updateHistory(asset: string, price: number, volume: number): void {
  const buf = priceVolHistory.get(asset) ?? [];
  buf.push({ price, volume });
  if (buf.length > VWAP_WINDOW) buf.shift();
  priceVolHistory.set(asset, buf);
}

function rollingVwap(asset: string): number {
  const buf = priceVolHistory.get(asset) ?? [];
  const totalVol = buf.reduce((s, p) => s + p.volume, 0);
  if (totalVol === 0) return 0;
  return buf.reduce((s, p) => s + p.price * p.volume, 0) / totalVol;
}

interface VwapOrder {
  id: number;
  asset: string;
  side: "BUY" | "SELL";
  totalQty: number;
  filledQty: number;
  costBasis: number;
  expiresAt: number;
  maxDeviation: number;
  maxSlice: number;
}

let nextId = 1;
const activeOrders = new Map<number, VwapOrder>();

async function processTickForOrder(order: VwapOrder, tick: MarketTick): Promise<void> {
  const price = tick.prices[order.asset];
  const volume = tick.volumes[order.asset] ?? 0;

  if (!price) return;

  updateHistory(order.asset, price, volume);

  const vwap = rollingVwap(order.asset);
  const remaining = order.totalQty - order.filledQty;

  if (remaining <= 0 || vwap === 0) return;

  const deviation = Math.abs(price - vwap) / vwap;

  if (deviation > order.maxDeviation) {
    console.log(
      `⏸  VWAP [${order.id}] skip: price=${price.toFixed(4)} vwap=${vwap.toFixed(4)} ` +
      `dev=${(deviation * 100).toFixed(2)}% > max ${(order.maxDeviation * 100).toFixed(2)}%`,
    );
    sendDecisionEvent("skip", {
      algo: "VWAP",
      id: order.id,
      asset: order.asset,
      price,
      vwap,
      deviation,
      maxDeviation: order.maxDeviation,
    });
    return;
  }

  const sliceQty = Math.min(order.maxSlice, remaining);

  try {
    const res = await fetch(`http://${EMS_HOST}:${EMS_PORT}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset: order.asset,
        side: order.side,
        quantity: sliceQty,
      }),
    });
    const result = await res.json();

    if (result.filledQty > 0) {
      order.filledQty += result.filledQty;
      order.costBasis += result.filledQty * result.avgFillPrice;
      const avgFill = order.costBasis / order.filledQty;
      const pct = ((order.filledQty / order.totalQty) * 100).toFixed(1);
      console.log(
        `✅ VWAP [${order.id}] fill: ${result.filledQty} @ ${result.avgFillPrice} ` +
        `(vwap=${vwap.toFixed(4)} dev=${(deviation * 100).toFixed(2)}%) | ` +
        `total ${order.filledQty}/${order.totalQty} (${pct}%) avgFill=${avgFill.toFixed(4)}`,
      );
      sendDecisionEvent("fill", {
        algo: "VWAP",
        id: order.id,
        asset: order.asset,
        filled: result.filledQty,
        avgFillPrice: result.avgFillPrice,
        vwap,
        deviation,
      });
    } else {
      console.log(`⚠️  VWAP [${order.id}] no fill this tick: ${result.message}`);
      sendDecisionEvent("no_fill", { algo: "VWAP", id: order.id, asset: order.asset, reason: result.message });
    }
  } catch (error) {
    console.error(`❌ VWAP EMS call failed [${order.id}]:`, error);
    sendDecisionEvent("error", { algo: "VWAP", id: order.id, error: String(error) });
  }
}

marketClient.onTick((tick) => {
  const now = Date.now();

  for (const [id, order] of activeOrders) {
    if (now >= order.expiresAt || order.filledQty >= order.totalQty) {
      const avgFill = order.filledQty > 0 ? (order.costBasis / order.filledQty).toFixed(4) : "N/A";
      console.log(
        `✅ VWAP [${id}] complete: filled ${order.filledQty}/${order.totalQty} ${order.asset} avgFill=${avgFill}`,
      );
      activeOrders.delete(id);
      continue;
    }

    sendDecisionEvent("tick", { algo: "VWAP", id, asset: order.asset, ts: Date.now() });
    processTickForOrder(order, tick);
  }
});

interface VwapTradeRequest extends Trade {
  algoParams?: {
    maxDeviation?: number;
    maxSlice?: number;
  };
}

const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

Deno.serve({ port: PORT }, async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  const url = new URL(req.url);

  if (url.pathname === "/health" && req.method === "GET") {
    return new Response(
      JSON.stringify({
        service: "vwap",
        version: VERSION,
        status: "ok",
        activeOrders: activeOrders.size,
      }),
      { headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
  }

  try {
    const raw = (await req.json()) as VwapTradeRequest;
    const id = nextId++;
    const order: VwapOrder = {
      id,
      asset: raw.asset,
      side: raw.side,
      totalQty: raw.quantity,
      filledQty: 0,
      costBasis: 0,
      expiresAt: Date.now() + raw.expiresAt * 1_000,
      maxDeviation: raw.algoParams?.maxDeviation ?? 0.005,
      maxSlice: raw.algoParams?.maxSlice ?? 1_000,
    };
    activeOrders.set(id, order);
    console.log(
      `📥 VWAP [${id}] order: ${raw.side} ${raw.quantity} ${raw.asset} ` +
      `maxDev=${(order.maxDeviation * 100).toFixed(2)}% maxSlice=${order.maxSlice} ` +
      `expiry ${new Date(order.expiresAt).toLocaleTimeString()}`,
    );
    return new Response(
      JSON.stringify({ success: true, message: "VWAP execution started.", orderId: id }),
      { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  } catch {
    return new Response("Internal Server Error", { status: 500, headers: CORS_HEADERS });
  }
});

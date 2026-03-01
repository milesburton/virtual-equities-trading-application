import "https://deno.land/std@0.210.0/dotenv/load.ts";
import type { Trade } from "../types/types.ts";
import { MarketSimClient, type MarketTick } from "../lib/marketSimClient.ts";
import { sendDecisionEvent } from "../observability/client.ts";

const PORT = Number(Deno.env.get("POV_ALGO_PORT")) || 5_005;
const EMS_PORT = Number(Deno.env.get("EMS_PORT")) || 5_001;
const EMS_HOST = Deno.env.get("EMS_HOST") || "localhost";
const MARKET_SIM_PORT = Number(Deno.env.get("MARKET_SIM_PORT")) || 5_000;
const MARKET_SIM_HOST = Deno.env.get("MARKET_SIM_HOST") || "localhost";

const POV_RATE = Number(Deno.env.get("POV_PERCENTAGE")) / 100 || 0.10;
const MIN_SLICE = Number(Deno.env.get("POV_MIN_SLICE")) || 10;
const MAX_SLICE = Number(Deno.env.get("POV_MAX_SLICE")) || 5_000;

console.log(`POV Algo running on port ${PORT}, rate=${(POV_RATE * 100).toFixed(0)}%`);

const marketClient = new MarketSimClient(MARKET_SIM_HOST, MARKET_SIM_PORT);
marketClient.start();

interface PovOrder {
  id: number;
  order: Trade;
  expiresAt: number;
  filledQty: number;
  costBasis: number;
}

let nextId = 1;
const activeOrders = new Map<number, PovOrder>();

async function processTickForOrder(state: PovOrder, tick: MarketTick): Promise<void> {
  const tickVolume = tick.volumes[state.order.asset] ?? 0;
  const remaining = state.order.quantity - state.filledQty;

  if (tickVolume === 0 || remaining <= 0) return;

  const rawSlice = Math.round(tickVolume * POV_RATE);
  const sliceQty = Math.max(MIN_SLICE, Math.min(MAX_SLICE, Math.min(rawSlice, remaining)));

  try {
    const res = await fetch(`http://${EMS_HOST}:${EMS_PORT}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset: state.order.asset,
        side: state.order.side,
        quantity: sliceQty,
      }),
    });
    const result = await res.json();

    if (result.filledQty > 0) {
      state.filledQty += result.filledQty;
      state.costBasis += result.filledQty * result.avgFillPrice;
      const avgFill = state.costBasis / state.filledQty;
      const pct = ((state.filledQty / state.order.quantity) * 100).toFixed(1);
      const mktPrice = tick.prices[state.order.asset] ?? "N/A";
      console.log(
        `📊 POV [${state.id}] tick fill: ${result.filledQty} ${state.order.asset} ` +
        `@ ${result.avgFillPrice} (mkt ${mktPrice}) | ` +
        `tickVol=${tickVolume} slice=${sliceQty} ` +
        `total=${state.filledQty}/${state.order.quantity} (${pct}%) avgFill=${avgFill.toFixed(4)}`,
      );
      // decision log: tick fill
      sendDecisionEvent("fill", {
        algo: "POV",
        id: state.id,
        asset: state.order.asset,
        sliceQty,
        filled: result.filledQty,
        avgFillPrice: result.avgFillPrice,
        tickVolume,
      });
    } else {
      console.log(`⚠️  POV [${state.id}] no fill this tick: ${result.message}`);
      sendDecisionEvent("no_fill", {
        algo: "POV",
        id: state.id,
        asset: state.order.asset,
        sliceQty,
        reason: result.message,
        tickVolume,
      });
    }
  } catch (error) {
    console.error(`❌ POV EMS call failed [${state.id}]:`, error);
    sendDecisionEvent("error", { algo: "POV", id: state.id, error: String(error) });
  }
}

marketClient.onTick((tick) => {
  const now = Date.now();

  for (const [id, state] of activeOrders) {
    if (now >= state.expiresAt || state.filledQty >= state.order.quantity) {
      const avgFill = state.filledQty > 0 ? (state.costBasis / state.filledQty).toFixed(4) : "N/A";
      console.log(
        `✅ POV [${id}] complete: filled ${state.filledQty}/${state.order.quantity} ${state.order.asset} avgFill=${avgFill}`,
      );
      activeOrders.delete(id);
      continue;
    }

    // decision log: process tick
    sendDecisionEvent("tick", { algo: "POV", id: state.id, asset: state.order.asset, tickTime: Date.now() });
    processTickForOrder(state, tick);
  }
});

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
        service: "pov",
        version: VERSION,
        status: "ok",
        activeOrders: activeOrders.size,
      }),
      { headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  }

  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });

  try {
    const raw: Trade = await req.json();
    const id = nextId++;
    const state: PovOrder = {
      id,
      order: raw,
      expiresAt: Date.now() + raw.expiresAt * 1_000,
      filledQty: 0,
      costBasis: 0,
    };
    activeOrders.set(id, state);
    console.log(
      `📥 POV [${id}] order: ${raw.side} ${raw.quantity} ${raw.asset} ` +
      `rate=${(POV_RATE * 100).toFixed(0)}% expiry ${new Date(state.expiresAt).toLocaleTimeString()}`,
    );
    return new Response(
      JSON.stringify({ success: true, message: "POV execution started.", orderId: id }),
      { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  } catch (_error) {
    return new Response("Internal Server Error", { status: 500, headers: CORS_HEADERS });
  }
});


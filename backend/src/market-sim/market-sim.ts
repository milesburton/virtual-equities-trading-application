import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { serve } from "https://deno.land/std@0.210.0/http/server.ts";
import { advanceRegime, generatePrice, marketData, refreshSectorShocks } from "./priceEngine.ts";
import { ASSET_MAP, SP500_ASSETS } from "./sp500Assets.ts";
import { intradayVolumeFactor } from "../lib/timeScale.ts";
import { createProducer } from "../lib/messaging.ts";

const PORT = Number(Deno.env.get("MARKET_SIM_PORT")) || 5_000;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

const producer = await createProducer("market-sim").catch((err) => {
  console.warn("[market-sim] Redpanda unavailable, ticks will not be published to bus:", err.message);
  return null;
});

let marketMinute = 0;
let tickCount = 0;
const TICKS_PER_MINUTE = 240; // 4 ticks/s × 60 s

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function computeTickVolumes(minute: number): Record<string, number> {
  const factor = intradayVolumeFactor(minute);
  const result: Record<string, number> = {};
  for (const asset of SP500_ASSETS) {
    const basePerMinute = asset.dailyVolume / 390;
    const jitter = 0.7 + Math.random() * 0.6;
    result[asset.symbol] = Math.round(basePerMinute * factor * jitter);
  }
  return result;
}

interface OrderBookLevel { price: number; size: number; }
interface OrderBookSnapshot { bids: OrderBookLevel[]; asks: OrderBookLevel[]; mid: number; ts: number; }

function computeOrderBook(
  prices: Record<string, number>,
  volumes: Record<string, number>,
): Record<string, OrderBookSnapshot> {
  const book: Record<string, OrderBookSnapshot> = {};
  const now = Date.now();
  for (const [symbol, mid] of Object.entries(prices)) {
    const tickVol = volumes[symbol] ?? 1_000;
    const baseSize = Math.max(1, Math.round(tickVol / 390));
    // Spread scales with daily volatility: more volatile assets have wider spreads.
    // Anchor at ~5 bps half-spread for a low-vol stock (vol=0.01), up to ~20 bps for high-vol.
    const dailyVol = ASSET_MAP.get(symbol)?.volatility ?? 0.02;
    const spreadBps = Math.max(3, Math.min(20, dailyVol * 600)); // 3–20 bps
    const spread = mid * (spreadBps / 10_000); // half-spread per level
    const bids: OrderBookLevel[] = [];
    const asks: OrderBookLevel[] = [];
    for (let i = 0; i < 10; i++) {
      const offset = (i + 0.5) * spread;
      const sizeDecay = Math.max(1, Math.round(baseSize * (1 - i * 0.08)));
      bids.push({ price: parseFloat((mid - offset).toFixed(4)), size: sizeDecay });
      asks.push({ price: parseFloat((mid + offset).toFixed(4)), size: sizeDecay });
    }
    book[symbol] = { bids, asks, mid, ts: now };
  }
  return book;
}

// Track active WebSocket clients for broadcast
const clients = new Set<WebSocket>();

// Global tick loop — advances market and broadcasts to all WS clients + Redpanda
setInterval(() => {
  tickCount++;
  if (tickCount % TICKS_PER_MINUTE === 0) marketMinute = (marketMinute + 1) % 390;
  // Advance shared state before generating individual prices
  advanceRegime();
  refreshSectorShocks();
  Object.keys(marketData).forEach((asset) => generatePrice(asset));
  const volumes = computeTickVolumes(marketMinute);
  const orderBook = computeOrderBook(marketData, volumes);
  const tick = { prices: { ...marketData }, volumes, marketMinute, orderBook };
  const msg = JSON.stringify({ event: "marketUpdate", data: tick });

  for (const socket of clients) {
    try { socket.send(msg); } catch { clients.delete(socket); }
  }

  // Publish once to Redpanda per tick (not per client)
  producer?.send("market.ticks", tick).catch(() => {});
}, 250);

console.log(`Market Simulator running on ws://localhost:${PORT}`);

serve((req) => {
  const url = new URL(req.url);

  if (url.pathname === "/health" && req.method === "GET") {
    return new Response(
      JSON.stringify({ service: "market-sim", version: VERSION, status: "ok" }),
      { headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  }

  if (url.pathname === "/assets" && req.method === "GET") {
    return new Response(JSON.stringify(SP500_ASSETS), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onopen = () => {
    console.log("New WebSocket connection");
    clients.add(socket);
    const volumes = computeTickVolumes(marketMinute);
    const orderBook = computeOrderBook(marketData, volumes);
    const snapshot = { prices: { ...marketData }, volumes, marketMinute, orderBook };
    socket.send(JSON.stringify({ event: "marketData", data: snapshot }));
  };

  socket.onmessage = (event) => {
    console.log(`Message from client: ${event.data}`);
  };

  socket.onclose = () => {
    clients.delete(socket);
    console.log("WebSocket connection closed");
  };

  return response;
}, { port: PORT });

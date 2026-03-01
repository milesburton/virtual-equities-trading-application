import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { serve } from "https://deno.land/std@0.210.0/http/server.ts";
import { generatePrice, marketData } from "./priceEngine.ts";
import { SP500_ASSETS } from "./sp500Assets.ts";
import { intradayVolumeFactor } from "../lib/timeScale.ts";

const PORT = Number(Deno.env.get("MARKET_SIM_PORT")) || 5_000;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

let marketMinute = 0;

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
    const volumes = computeTickVolumes(marketMinute);
    socket.send(
      JSON.stringify({
        event: "marketData",
        data: { prices: { ...marketData }, volumes, marketMinute },
      }),
    );
  };

  socket.onmessage = (event) => {
    console.log(`Message from client: ${event.data}`);
  };

  const interval = setInterval(() => {
    marketMinute = (marketMinute + 1) % 390;
    Object.keys(marketData).forEach((asset) => generatePrice(asset));
    const volumes = computeTickVolumes(marketMinute);
    socket.send(
      JSON.stringify({
        event: "marketUpdate",
        data: { prices: { ...marketData }, volumes, marketMinute },
      }),
    );
  }, 1_000);

  socket.onclose = () => {
    clearInterval(interval);
    console.log("WebSocket connection closed");
  };

  return response;
}, { port: PORT });

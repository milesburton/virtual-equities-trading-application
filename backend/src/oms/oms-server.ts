import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { serve } from "https://deno.land/std@0.210.0/http/server.ts";

const PORT = Number(Deno.env.get("OMS_PORT")) || 5_002;
const ALGO_TRADER_PORT = Number(Deno.env.get("ALGO_TRADER_PORT")) || 5_003;
const TWAP_ALGO_PORT = Number(Deno.env.get("TWAP_ALGO_PORT")) || 5_004;
const POV_ALGO_PORT = Number(Deno.env.get("POV_ALGO_PORT")) || 5_005;
const VWAP_ALGO_PORT = Number(Deno.env.get("VWAP_ALGO_PORT")) || 5_006;
const ALGO_HOST = Deno.env.get("ALGO_HOST") || "localhost";

const STRATEGY_URLS: Record<string, string> = {
  LIMIT: `http://${ALGO_HOST}:${ALGO_TRADER_PORT}`,
  TWAP: `http://${ALGO_HOST}:${TWAP_ALGO_PORT}`,
  POV: `http://${ALGO_HOST}:${POV_ALGO_PORT}`,
  VWAP: `http://${ALGO_HOST}:${VWAP_ALGO_PORT}`,
};

const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

console.log(`🚀 Order Management System (OMS) running on port ${PORT}`);

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
      JSON.stringify({ service: "oms", version: VERSION, status: "ok" }),
      { headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
  }

  try {
    const trade = await req.json();
    console.log("📥 Received Trade Request:", trade);

    const strategy: string = (trade.strategy ?? "LIMIT").toUpperCase();
    const algoUrl = STRATEGY_URLS[strategy];

    if (!algoUrl) {
      return new Response(
        JSON.stringify({ success: false, message: `Unknown strategy: ${strategy}` }),
        { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
      );
    }

    console.log(`📤 Routing ${strategy} order to ${algoUrl}`);

    const algoResponse = await fetch(algoUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(trade),
    });

    const result = await algoResponse.json();
    console.log(`✅ Algo acknowledged:`, result);

    return new Response(JSON.stringify(result), {
      status: algoResponse.status,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (error) {
    console.error("❌ Error processing trade:", error);
    return new Response("Internal Server Error", { status: 500, headers: CORS_HEADERS });
  }
}

serve(handleTradeRequest, { port: PORT });

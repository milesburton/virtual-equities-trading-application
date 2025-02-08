import { serve } from "https://deno.land/std@0.118.0/http/server.ts";

interface TradeRequest {
  asset: string;
  side: "BUY" | "SELL";
  quantity: number;
}

interface TradeResponse {
  success: boolean;
  message: string;
  price?: number;
  totalCost?: number;
}

// Mock Market Data Store (Reference from Market Simulation)
const marketData: Record<string, number> = {
  "AAPL": 150.0,
  "TSLA": 850.0,
  "GBP/USD": 1.35,
  "EUR/USD": 1.12,
};

async function handleTradeRequest(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Only POST requests are allowed", { status: 405 });
  }

  const trade: TradeRequest = await req.json();

  if (!marketData[trade.asset]) {
    return new Response(JSON.stringify({ success: false, message: "Invalid asset" }), { status: 400 });
  }

  const price = marketData[trade.asset];
  const totalCost = trade.quantity * price;

  console.log(`📊 Executing ${trade.side} order for ${trade.quantity} of ${trade.asset} at ${price}`);

  const response: TradeResponse = {
    success: true,
    message: `Trade executed: ${trade.side} ${trade.quantity} ${trade.asset} at ${price}`,
    price,
    totalCost,
  };

  return new Response(JSON.stringify(response), { headers: { "Content-Type": "application/json" } });
}

const PORT = Number(Deno.env.get("EMS_PORT")) || 5001;

console.log(`🚀 EMS running on port ${PORT}`);

serve(handleTradeRequest, { port: PORT });
import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { serve } from "https://deno.land/std@0.210.0/http/server.ts";

const PORT = Number(Deno.env.get("OMS_PORT")) || 5002;

console.log(`🚀 Order Management System (OMS) running on port ${PORT}`);

async function handleTradeRequest(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const trade = await req.json();
    console.log("📥 Received Trade Request:", trade);

    // Simulate trade processing
    const tradeResult = {
      status: "accepted",
      tradeId: crypto.randomUUID(),
      asset: trade.asset,
      side: trade.side,
      quantity: trade.quantity,
      limitPrice: trade.limitPrice,
      expiresAt: trade.expiresAt,
    };

    console.log("✅ Trade Processed:", tradeResult);
    return new Response(JSON.stringify(tradeResult), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("❌ Error processing trade:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

serve(handleTradeRequest, { port: PORT });

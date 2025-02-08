import "https://deno.land/std@0.210.0/dotenv/load.ts";

const PORT = Number(Deno.env.get("TWAP_ALGO_PORT")) || 5004;
const INTERVAL_MS = Number(Deno.env.get("TWAP_INTERVAL_MS")) || 5000;

console.log(`🚀 TWAP Algo running on port ${PORT}, executing every ${INTERVAL_MS}ms`);

async function executeTWAP(trade) {
  console.log(`⏳ Executing TWAP Order: ${trade.quantity} ${trade.asset} over time`);
  const orderSize = trade.quantity / (trade.expiresAt / (INTERVAL_MS / 1000));

  let executed = 0;
  while (executed < trade.quantity) {
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
    executed += orderSize;
    console.log(`📈 TWAP Executed: ${Math.min(executed, trade.quantity)}/${trade.quantity}`);
  }
  console.log("✅ TWAP Order Complete");
}

Deno.serve({ port: PORT }, async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  try {
    const trade = await req.json();
    executeTWAP(trade);
    return new Response("TWAP Execution Started", { status: 200 });
  } catch (error) {
    return new Response("Internal Server Error", { status: 500 });
  }
});

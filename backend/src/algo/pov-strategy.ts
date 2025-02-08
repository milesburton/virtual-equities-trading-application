import "https://deno.land/std@0.210.0/dotenv/load.ts";

const PORT = Number(Deno.env.get("POV_ALGO_PORT")) || 5005;
const POV_PERCENTAGE = Number(Deno.env.get("POV_PERCENTAGE")) || 10;

console.log(`🚀 POV Algo running on port ${PORT}, trading ${POV_PERCENTAGE}% of market volume`);

async function executePOV(trade) {
  console.log(`📊 Executing POV Order: ${trade.quantity} ${trade.asset} based on market volume`);
  
  for (let i = 0; i < trade.expiresAt; i += 5) {
    const marketVolume = Math.random() * 1000; // Simulated market volume
    const orderSize = (POV_PERCENTAGE / 100) * marketVolume;
    
    console.log(`📊 Market Volume: ${marketVolume}, Executing: ${Math.min(orderSize, trade.quantity)}`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  
  console.log("✅ POV Order Complete");
}

Deno.serve({ port: PORT }, async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  try {
    const trade = await req.json();
    executePOV(trade);
    return new Response("POV Execution Started", { status: 200 });
  } catch (error) {
    return new Response("Internal Server Error", { status: 500 });
  }
});

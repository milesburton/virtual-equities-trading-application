import type { Trade } from "../types/types";

let latestPrices: Record<string, number> = {};
const pendingTrades: Trade[] = [];

// Function to execute a trade when conditions are met
async function placeTrade(trade: Trade) {
  try {
    const response = await fetch("http://localhost:8081", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(trade),
    });
    const result = await response.json();
    console.log(`✅ Trade Executed: ${trade.side} ${trade.quantity} ${trade.asset} at ${latestPrices[trade.asset]}`, result);
  } catch (error) {
    console.error("❌ Failed to execute trade:", error);
  }
}

// Function to check if pending trades should be executed or canceled
function checkTrades() {
  const now = Date.now();
  for (let i = pendingTrades.length - 1; i >= 0; i--) {
    const trade = pendingTrades[i];
    const marketPrice = latestPrices[trade.asset];

    if (!marketPrice) continue;

    if (now >= trade.expiresAt) {
      console.log(`⏳ Trade expired: ${trade.side} ${trade.quantity} ${trade.asset} (Limit: ${trade.limitPrice})`);
      pendingTrades.splice(i, 1); // Remove expired trade
      continue;
    }

    if ((trade.side === "BUY" && marketPrice <= trade.limitPrice) ||
        (trade.side === "SELL" && marketPrice >= trade.limitPrice)) {
      console.log(`🚀 Executing trade: ${trade.side} ${trade.quantity} ${trade.asset} at ${marketPrice}`);
      placeTrade(trade);
      pendingTrades.splice(i, 1); // Remove from queue after execution
    }
  }
}

// WebSocket connection to market data feed
const ws = new WebSocket("ws://localhost:8080");

ws.onopen = () => {
  console.log("📡 Connected to Market Data Feed");
};

ws.onmessage = (event) => {
  try {
    const marketUpdate = JSON.parse(event.data);
    latestPrices = marketUpdate.data;
    checkTrades(); // Check if any trades should be executed
  } catch (error) {
    console.error("⚠️ Error processing market update:", error);
  }
};

ws.onclose = () => {
  console.log("❌ Disconnected from Market Data Feed");
};

// Set up the HTTP server to accept trade requests
const PORT = Number(Deno.env.get("LIMIT_ALGO_PORT")) || 5003;
Deno.serve({ port: PORT }, async (req) => {
  if (req.method === "POST") {
    try {
      const trade: Trade = await req.json();
      trade.expiresAt = Date.now() + trade.expiresAt * 1000; // Convert seconds to timestamp
      console.log(`📥 Received Trade Request: ${trade.side} ${trade.quantity} ${trade.asset} (Limit: ${trade.limitPrice}, Expiry: ${new Date(trade.expiresAt).toLocaleTimeString()})`);
      pendingTrades.push(trade);
      return new Response(JSON.stringify({ success: true, message: "Trade request queued." }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ success: false, message: "Invalid trade request." }), {
        headers: { "Content-Type": "application/json" },
        status: 400,
      });
    }
  }
  return new Response("Limit Order Algo Running", { status: 200 });
});

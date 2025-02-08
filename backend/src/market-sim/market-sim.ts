import { serve } from "https://deno.land/std@0.118.0/http/server.ts";

// Market Data Store
const marketData: Record<string, number> = {
  "AAPL": 150.0,
  "TSLA": 850.0,
  "GBP/USD": 1.35,
  "EUR/USD": 1.12,
};

// Function to generate random price movements
function generatePrice(asset: string): number {
  const volatility = 0.02; // 2% max movement per tick
  const change = (Math.random() * volatility * 2 - volatility) * marketData[asset];
  marketData[asset] = parseFloat((marketData[asset] + change).toFixed(4));
  return marketData[asset];
}

// HTTP Server to handle WebSocket connections
serve((req) => {
  const { socket, response } = Deno.upgradeWebSocket(req);
  socket.onopen = () => {
    console.log("📶 New WebSocket connection");
    socket.send(JSON.stringify({ event: "marketData", data: marketData }));
  };
  socket.onmessage = (event) => {
    console.log(`📩 Message from client: ${event.data}`);
  };
  socket.onclose = () => {
    console.log("❌ WebSocket connection closed");
  };

  // Send live price updates every second
  const interval = setInterval(() => {
    Object.keys(marketData).forEach((asset) => generatePrice(asset));
    socket.send(JSON.stringify({ event: "marketUpdate", data: marketData }));
  }, 1000);

  socket.onclose = () => clearInterval(interval);

  return response;
}, { port: 8080 });

console.log("📡 Market Data WebSocket running on ws://localhost:8080");

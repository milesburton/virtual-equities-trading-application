import { prompt } from "https://deno.land/std@0.118.0/io/prompt.ts";

async function placeTrade() {
  console.log("🚀 Welcome to the Trading CLI! 🎉");
  
  const asset = prompt("Enter asset (default: AAPL): ") || "AAPL";
  const side = (prompt("Enter trade side (BUY/SELL) (default: BUY): ") || "BUY").toUpperCase();
  if (side !== "BUY" && side !== "SELL") {
    console.log("❌ Invalid trade side. Please enter 'BUY' or 'SELL'.");
    return;
  }

  const quantityStr = prompt("Enter quantity (default: 10): ") || "10";
  const quantity = Number(quantityStr);
  if (isNaN(quantity) || quantity <= 0) {
    console.log("❌ Invalid quantity. Please enter a positive number.");
    return;
  }

  const limitPriceStr = prompt("Enter limit price (default: 150): ") || "150";
  const limitPrice = Number(limitPriceStr);
  if (isNaN(limitPrice) || limitPrice <= 0) {
    console.log("❌ Invalid limit price. Please enter a valid number.");
    return;
  }

  const expiresAtStr = prompt("Enter expiry time in seconds (default: 300): ") || "300";
  const expiresAt = Number(expiresAtStr);
  if (isNaN(expiresAt) || expiresAt <= 0) {
    console.log("❌ Invalid expiry time. Please enter a positive number.");
    return;
  }

  const trade = { asset, side, quantity, limitPrice, expiresAt };
  console.log("📡 Sending trade request...", trade);

  try {
    const response = await fetch("http://localhost:8083", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(trade),
    });

    const result = await response.json();
    console.log("✅ Trade Result:", result);
  } catch (error) {
    console.log("❌ Failed to execute trade:", error);
  }
}

placeTrade();

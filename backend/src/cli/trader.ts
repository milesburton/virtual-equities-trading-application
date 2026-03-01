import { Input, Select } from "https://deno.land/x/cliffy@v0.25.4/prompt/mod.ts";
import "https://deno.land/std@0.210.0/dotenv/load.ts";
import type { Trade } from "../types/types.ts";

const DEFAULT_OMS_URL = Deno.env.get("OMS_URL") || "http://localhost:5002";
const DEFAULT_TWAP_URL = Deno.env.get("TWAP_ALGO_URL") || "http://localhost:5004";
const DEFAULT_POV_URL = Deno.env.get("POV_ALGO_URL") || "http://localhost:5005";

async function placeTrade() {
  console.log("🚀 Welcome to the Trading CLI! 🎉");

  const strategy = await Select.prompt({
    message: "Choose strategy:",
    options: [
      { name: "Limit Order", value: "LIMIT" },
      { name: "TWAP (Time-Weighted Average Price)", value: "TWAP" },
      { name: "POV (Percentage of Volume)", value: "POV" },
    ],
  });

  const asset = await Input.prompt({ message: "Enter asset", default: "AAPL" });

  const side = await Select.prompt({
    message: "Enter trade side:",
    options: [
      { name: "BUY", value: "BUY" },
      { name: "SELL", value: "SELL" },
    ],
  });

  const quantity = Number(await Input.prompt({ message: "Enter quantity", default: "10" }));
  if (isNaN(quantity) || quantity <= 0) {
    console.log("❌ Invalid quantity. Please enter a positive number.");
    return;
  }

  const limitPrice = Number(await Input.prompt({ message: "Enter limit price", default: "150" }));
  if (isNaN(limitPrice) || limitPrice <= 0) {
    console.log("❌ Invalid limit price. Please enter a valid number.");
    return;
  }

  const expiresAt = Number(await Input.prompt({ message: "Enter expiry time in seconds", default: "300" }));
  if (isNaN(expiresAt) || expiresAt <= 0) {
    console.log("❌ Invalid expiry time. Please enter a positive number.");
    return;
  }

  const trade: Trade = { asset, side: side as "BUY" | "SELL", quantity, limitPrice, expiresAt };

  let algoUrl = DEFAULT_OMS_URL;
  if (strategy === "TWAP") algoUrl = DEFAULT_TWAP_URL;
  if (strategy === "POV") algoUrl = DEFAULT_POV_URL;

  console.log("📡 Sending trade request to:", algoUrl, trade);

  try {
    const response = await fetch(algoUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(trade),
    });

    if (!response.ok) {
      console.log(`❌ OMS/Algo responded with an error: ${response.status} ${response.statusText}`);
      return;
    }

    const result = await response.json();
    console.log("✅ Trade Result:", result);
  } catch (error) {
    console.log("❌ Failed to execute trade:", error);
  }
}

placeTrade();

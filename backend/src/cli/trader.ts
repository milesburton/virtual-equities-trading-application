import { Input } from "https://deno.land/x/cliffy@v0.25.4/prompt/mod.ts";
import "https://deno.land/std@0.210.0/dotenv/load.ts";

const DEFAULT_OMS_URL = Deno.env.get("OMS_URL") || "http://localhost:5002";

async function placeTrade() {
  console.log("🚀 Welcome to the Trading CLI! 🎉");

  const omsUrl = await Input.prompt({ message: "Enter OMS URL", default: DEFAULT_OMS_URL });
  if (omsUrl === undefined) {
      console.log("❌ Operation cancelled by user.");
      return;
  }

  const asset = await Input.prompt({ message: "Enter asset", default: "AAPL" });
   if (asset === undefined) {
      console.log("❌ Operation cancelled by user.");
      return;
  }

  const sideInput = await Input.prompt({ message: "Enter trade side (BUY/SELL)", default: "BUY" });
  if (sideInput === undefined) {
    console.log("❌ Operation cancelled by user.");
    return;
  }
  const side = sideInput.toUpperCase(); // Now safe to call toUpperCase()

  if (side !== "BUY" && side !== "SELL") {
    console.log("❌ Invalid trade side. Please enter 'BUY' or 'SELL'.");
    return;
  }

  const quantityInput = await Input.prompt({ message: "Enter quantity", default: "10" });
    if (quantityInput === undefined) {
      console.log("❌ Operation cancelled by user.");
      return;
  }
  const quantity = Number(quantityInput);
  if (isNaN(quantity) || quantity <= 0) {
    console.log("❌ Invalid quantity. Please enter a positive number.");
    return;
  }

  const limitPriceInput = await Input.prompt({ message: "Enter limit price", default: "150" });
    if (limitPriceInput === undefined) {
      console.log("❌ Operation cancelled by user.");
      return;
  }
  const limitPrice = Number(limitPriceInput);
  if (isNaN(limitPrice) || limitPrice <= 0) {
    console.log("❌ Invalid limit price.  Please enter a valid number.");
    return;
  }

    const expiresAtInput = await Input.prompt({ message: "Enter expiry time in seconds", default: "300" });
    if (expiresAtInput === undefined) {
      console.log("❌ Operation cancelled by user.");
      return;
  }
    const expiresAt = Number(expiresAtInput);
  if (isNaN(expiresAt) || expiresAt <= 0) {
    console.log("❌ Invalid expiry time. Please enter a positive number.");
    return;
  }


  const trade = { asset, side, quantity, limitPrice, expiresAt };
  console.log("📡 Sending trade request to:", omsUrl, trade);

  try {
    const response = await fetch(omsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(trade),
    });

    if (!response.ok) {
      console.log(`❌ OMS Server responded with an error: ${response.status} ${response.statusText}`);
      return;
    }

    const result = await response.json();
    console.log("✅ Trade Result:", result);
  } catch (error) {
    console.log("❌ Failed to execute trade:", error);
  }
}

placeTrade();
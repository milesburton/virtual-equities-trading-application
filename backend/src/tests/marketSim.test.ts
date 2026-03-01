import { assertEquals } from "https://deno.land/std@0.210.0/testing/asserts.ts";
import { generatePrice, marketData } from "../market-sim/priceEngine.ts";

Deno.test("generatePrice returns a number for a known asset", () => {
  const price = generatePrice("AAPL");
  assertEquals(typeof price, "number");
});

Deno.test("generatePrice stays within per-asset volatility band", () => {
  // AAPL has volatility 0.018 — max move is ±1.8% of current price
  const asset = "AAPL";
  const before = marketData[asset];
  const after = generatePrice(asset);
  const maxMove = before * 0.018;
  const diff = Math.abs(after - before);
  assertEquals(diff <= maxMove + 0.001, true); // small float tolerance
});

Deno.test("generatePrice updates marketData in place", () => {
  const asset = "MSFT";
  generatePrice(asset);
  assertEquals(typeof marketData[asset], "number");
  assertEquals(marketData[asset] > 0, true);
});

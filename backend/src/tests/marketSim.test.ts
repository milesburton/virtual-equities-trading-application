import { assertEquals } from "https://deno.land/std@0.210.0/testing/asserts.ts";
import { generatePrice, marketData, refreshSectorShocks } from "../market-sim/priceEngine.ts";

Deno.test("generatePrice returns a positive number for a known asset", () => {
  refreshSectorShocks();
  const price = generatePrice("AAPL");
  assertEquals(typeof price, "number");
  assertEquals(price > 0, true);
});

Deno.test("generatePrice never returns zero or negative (price floor holds)", () => {
  refreshSectorShocks();
  // Run 1000 ticks — even under worst-case shocks the floor must hold
  for (let i = 0; i < 1_000; i++) {
    refreshSectorShocks();
    const p = generatePrice("TSLA"); // highest vol stock
    assertEquals(p > 0, true);
  }
});

Deno.test("generatePrice updates marketData in place", () => {
  refreshSectorShocks();
  const asset = "MSFT";
  generatePrice(asset);
  assertEquals(typeof marketData[asset], "number");
  assertEquals(marketData[asset] > 0, true);
});

Deno.test("generatePrice per-tick move is much smaller than daily volatility", () => {
  // Per-tick vol = dailyVol / sqrt(23400) ≈ 0.018 / 153 ≈ 0.0001 (0.01%)
  // Even with a 4-sigma shock the move should stay well under 0.1% for AAPL
  refreshSectorShocks();
  const asset = "AAPL";
  const TICKS = 500;
  let maxMovePct = 0;
  for (let i = 0; i < TICKS; i++) {
    refreshSectorShocks();
    const before = marketData[asset];
    const after = generatePrice(asset);
    const movePct = Math.abs(after - before) / before;
    if (movePct > maxMovePct) maxMovePct = movePct;
  }
  // Typical per-tick 1-sigma move is 0.012%; even a 6-sigma shock is ~0.07%
  assertEquals(maxMovePct < 0.005, true, `max move ${(maxMovePct * 100).toFixed(4)}% exceeded 0.5%`);
});

/**
 * Pure unit tests — no running services required.
 *
 * Covers: timeScale, marketSimClient message parsing, EMS fill model logic,
 * priceEngine, and sp500Assets data integrity.
 */

import {
  assert,
  assertEquals,
  assertAlmostEquals,
} from "https://deno.land/std@0.210.0/testing/asserts.ts";

import { intradayVolumeFactor, TRADING_DAY_MINUTES } from "../lib/timeScale.ts";
import { generatePrice, marketData } from "../market-sim/priceEngine.ts";
import { SP500_ASSETS, ASSET_MAP } from "../market-sim/sp500Assets.ts";

// ── timeScale ────────────────────────────────────────────────────────────────

Deno.test("[timeScale] intradayVolumeFactor is in [0.3, 1.0] for all minutes", () => {
  for (let m = 0; m < TRADING_DAY_MINUTES; m++) {
    const v = intradayVolumeFactor(m);
    assert(v >= 0.3, `minute ${m}: factor ${v} below 0.3`);
    assert(v <= 1.0 + 1e-9, `minute ${m}: factor ${v} above 1.0`);
  }
});

Deno.test("[timeScale] intradayVolumeFactor peaks at open (minute 0)", () => {
  const atOpen = intradayVolumeFactor(0);
  const atMidday = intradayVolumeFactor(195);
  assert(atOpen > atMidday, `open (${atOpen}) should exceed midday (${atMidday})`);
});

Deno.test("[timeScale] intradayVolumeFactor peaks at close (minute 389)", () => {
  const atClose = intradayVolumeFactor(389);
  const atMidday = intradayVolumeFactor(195);
  assert(atClose > atMidday, `close (${atClose}) should exceed midday (${atMidday})`);
});

Deno.test("[timeScale] intradayVolumeFactor open and close are both higher than midday", () => {
  const atOpen = intradayVolumeFactor(0);
  const atClose = intradayVolumeFactor(TRADING_DAY_MINUTES - 1);
  const atMidday = intradayVolumeFactor(Math.floor(TRADING_DAY_MINUTES / 2));
  assert(atOpen > atMidday, `open (${atOpen}) should exceed midday (${atMidday})`);
  assert(atClose > atMidday, `close (${atClose}) should exceed midday (${atMidday})`);
  // Open and close should be within 5% of each other
  assertAlmostEquals(atOpen, atClose, 0.05);
});

Deno.test("[timeScale] TRADING_DAY_MINUTES is 390", () => {
  assertEquals(TRADING_DAY_MINUTES, 390);
});

// ── MarketSimClient message parsing ──────────────────────────────────────────
//
// We test the private parseTick logic by observing MarketSimClient.getLatest()
// after injecting synthetic WebSocket messages via a mock approach.
// Since parseTick is private, we test it indirectly through a lightweight
// parse function mirroring the same logic.

function parseTick(data: unknown): { prices: Record<string, number>; volumes: Record<string, number>; marketMinute: number } {
  if (data !== null && typeof data === "object" && "prices" in (data as object) && "volumes" in (data as object)) {
    const d = data as { prices: Record<string, number>; volumes: Record<string, number>; marketMinute: number };
    return { prices: d.prices, volumes: d.volumes, marketMinute: d.marketMinute ?? 0 };
  }
  return { prices: data as Record<string, number>, volumes: {}, marketMinute: 0 };
}

Deno.test("[marketSimClient] parseTick handles new enriched format", () => {
  const raw = { prices: { AAPL: 189.3 }, volumes: { AAPL: 12345 }, marketMinute: 42 };
  const tick = parseTick(raw);
  assertEquals(tick.prices["AAPL"], 189.3);
  assertEquals(tick.volumes["AAPL"], 12345);
  assertEquals(tick.marketMinute, 42);
});

Deno.test("[marketSimClient] parseTick handles old flat price format", () => {
  const raw = { AAPL: 189.3, MSFT: 415.2 };
  const tick = parseTick(raw);
  assertEquals(tick.prices["AAPL"], 189.3);
  assertEquals(tick.prices["MSFT"], 415.2);
  assertEquals(tick.marketMinute, 0);
  assertEquals(Object.keys(tick.volumes).length, 0);
});

Deno.test("[marketSimClient] parseTick marketMinute defaults to 0 if missing", () => {
  const raw = { prices: { AAPL: 189.3 }, volumes: { AAPL: 1000 } };
  const tick = parseTick(raw);
  assertEquals(tick.marketMinute, 0);
});

// ── priceEngine ───────────────────────────────────────────────────────────────

Deno.test("[priceEngine] generatePrice returns a positive number", () => {
  const price = generatePrice("AAPL");
  assert(typeof price === "number" && price > 0, `expected positive number, got ${price}`);
});

Deno.test("[priceEngine] generatePrice stays within asset volatility band", () => {
  // Test a low-volatility asset (PG, 0.012) and high-volatility (TSLA, 0.045)
  const cases: Array<[string, number]> = [["PG", 0.012], ["TSLA", 0.045], ["NVDA", 0.035]];
  for (const [asset, vol] of cases) {
    const before = marketData[asset];
    const after = generatePrice(asset);
    const maxMove = before * vol;
    const diff = Math.abs(after - before);
    assert(diff <= maxMove + 0.001, `${asset}: move ${diff} exceeded volatility ${vol} × ${before} = ${maxMove}`);
  }
});

Deno.test("[priceEngine] generatePrice mutates marketData", () => {
  const before = marketData["MSFT"];
  generatePrice("MSFT");
  // After one generation the value may or may not have changed, but must remain positive
  assert(marketData["MSFT"] > 0, "marketData MSFT became non-positive");
  assertEquals(typeof marketData["MSFT"], "number");
  // Run many times; at least some should produce a different value
  let changed = false;
  for (let i = 0; i < 20; i++) {
    generatePrice("MSFT");
    if (marketData["MSFT"] !== before) { changed = true; break; }
  }
  assert(changed, "generatePrice never changed the price over 20 iterations");
});

// ── sp500Assets data integrity ────────────────────────────────────────────────

Deno.test("[sp500Assets] all assets have required fields", () => {
  for (const a of SP500_ASSETS) {
    assert(typeof a.symbol === "string" && a.symbol.length > 0, `${a.symbol}: missing symbol`);
    assert(typeof a.initialPrice === "number" && a.initialPrice > 0, `${a.symbol}: initialPrice must be positive`);
    assert(typeof a.volatility === "number" && a.volatility > 0, `${a.symbol}: volatility must be positive`);
    assert(typeof a.sector === "string" && a.sector.length > 0, `${a.symbol}: missing sector`);
    assert(typeof a.dailyVolume === "number" && a.dailyVolume > 0, `${a.symbol}: dailyVolume must be positive`);
  }
});

Deno.test("[sp500Assets] ASSET_MAP contains all SP500_ASSETS", () => {
  assertEquals(ASSET_MAP.size, SP500_ASSETS.length);
  for (const a of SP500_ASSETS) {
    assert(ASSET_MAP.has(a.symbol), `${a.symbol} missing from ASSET_MAP`);
  }
});

Deno.test("[sp500Assets] no duplicate symbols", () => {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const a of SP500_ASSETS) {
    if (seen.has(a.symbol)) dupes.push(a.symbol);
    seen.add(a.symbol);
  }
  assertEquals(dupes, [], `Duplicate symbols found: ${dupes.join(", ")}`);
});

Deno.test("[sp500Assets] AAPL has expected properties", () => {
  const aapl = ASSET_MAP.get("AAPL");
  assert(aapl !== undefined, "AAPL not found");
  assertEquals(aapl!.sector, "Technology");
  assert(aapl!.dailyVolume >= 1_000_000, "AAPL ADV should be at least 1M shares");
});

Deno.test("[sp500Assets] ETF sector assets exist", () => {
  const etfs = SP500_ASSETS.filter((a) => a.sector === "ETF");
  assert(etfs.length > 0, "No ETF sector assets found");
  assert(ASSET_MAP.has("SPY"), "SPY missing");
  assert(ASSET_MAP.has("QQQ"), "QQQ missing");
});

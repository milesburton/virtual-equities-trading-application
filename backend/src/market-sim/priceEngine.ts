import { ASSET_MAP, SP500_ASSETS } from "./sp500Assets.ts";

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Trading seconds per day: 390 minutes × 60 seconds.
 * Used to scale annual/daily volatility to a per-tick figure.
 *
 * NOTE: We use a compressed time scale so 1 simulated second = 1 real second
 * but represents a much shorter slice of the trading day. Without compression
 * the per-tick σ would be ~0.012% (invisible wicks). The compression factor
 * makes 1 tick behave like ~1 trading minute, producing realistic candlestick
 * bodies and wicks.
 */
const TICKS_PER_DAY = 390; // 390 trading minutes per day (1 tick ≈ 1 minute)

/**
 * Mean-reversion strength (Ornstein–Uhlenbeck κ).
 * At 390 ticks/day, a value of 0.006 means prices drift back to their anchor
 * over roughly 1/κ ≈ 167 ticks (≈ 7 trading hours). Keeps the simulation
 * anchored without making movements look rubbery.
 */
const MEAN_REVERSION_SPEED = 0.006;

/**
 * Hard floor as a fraction of the initial price.
 * Prices cannot fall below this fraction of their starting value.
 */
const PRICE_FLOOR_RATIO = 0.10;

/**
 * Sector correlation factor [0–1].
 * Fraction of each tick's random shock shared with the sector.
 * At 0.35 sector members move together ~35% of the time.
 */
const SECTOR_CORRELATION = 0.35;

// ─── State ───────────────────────────────────────────────────────────────────

/** Current mid-prices for every asset. */
export const marketData: Record<string, number> = Object.fromEntries(
  SP500_ASSETS.map((a) => [a.symbol, a.initialPrice]),
);

/** Anchor prices used for mean reversion (never change). */
const anchorPrices: Record<string, number> = Object.fromEntries(
  SP500_ASSETS.map((a) => [a.symbol, a.initialPrice]),
);

/** Current sector drift shocks (refreshed each tick for all assets in a sector). */
const sectorShocks: Record<string, number> = {};

// ─── Market regime ────────────────────────────────────────────────────────────

/**
 * Global sentiment drift added to every asset's return each tick.
 * Switches randomly between a small bull/bear/neutral bias.
 */
let marketDrift = 0;
let regimeCountdown = 0;

function refreshRegime() {
  // Regime lasts between 30 s and 5 min
  regimeCountdown = 30 + Math.floor(Math.random() * 270);
  const r = Math.random();
  if (r < 0.40) {
    marketDrift = 0; // neutral (most common)
  } else if (r < 0.65) {
    marketDrift = 0.0002; // mild bull
  } else if (r < 0.85) {
    marketDrift = -0.0002; // mild bear
  } else if (r < 0.93) {
    marketDrift = 0.0006; // strong bull
  } else {
    marketDrift = -0.0006; // strong bear
  }
}

// ─── Box-Muller normal sampler ────────────────────────────────────────────────

function randn(): number {
  // Box–Muller transform — gives standard normal N(0,1)
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1 + 1e-12)) * Math.cos(2 * Math.PI * u2);
}

// ─── Tick ─────────────────────────────────────────────────────────────────────

/**
 * Advance the market regime counter; call once per tick before generatePrice.
 */
export function advanceRegime() {
  if (--regimeCountdown <= 0) refreshRegime();
}

/**
 * Refresh per-sector correlated shocks; call once per tick before generatePrice.
 */
export function refreshSectorShocks() {
  const sectors = new Set(SP500_ASSETS.map((a) => a.sector));
  for (const sector of sectors) {
    sectorShocks[sector] = randn();
  }
}

/**
 * Generate the next mid-price for `asset` using:
 *   - Geometric Brownian Motion (log-normal returns)
 *   - Correctly scaled per-tick volatility (daily vol / √23400)
 *   - Mild mean reversion toward the anchor price
 *   - Partial sector correlation (shared shock component)
 *   - Market regime drift
 *   - Hard price floor at 10 % of initial price
 */
export function generatePrice(asset: string): number {
  const def = ASSET_MAP.get(asset);
  const dailyVol = def?.volatility ?? 0.02;
  const sector = def?.sector ?? "Unknown";
  const anchor = anchorPrices[asset];
  const current = marketData[asset];

  // Scale daily volatility to per-tick (σ_tick = σ_day / √N)
  const tickVol = dailyVol / Math.sqrt(TICKS_PER_DAY);

  // Idiosyncratic (asset-specific) shock
  const idioShock = randn();

  // Blend: sqrt(ρ)*sector + sqrt(1-ρ)*idiosyncratic
  const sectorShock = sectorShocks[sector] ?? 0;
  const combinedShock =
    Math.sqrt(SECTOR_CORRELATION) * sectorShock +
    Math.sqrt(1 - SECTOR_CORRELATION) * idioShock;

  // Mean reversion (OU): pulls log-price back toward log-anchor
  const logReturn = marketDrift +
    MEAN_REVERSION_SPEED * Math.log(anchor / current) +
    tickVol * combinedShock;

  // Geometric update (log-normal)
  let next = current * Math.exp(logReturn);

  // Hard floor
  const floor = anchor * PRICE_FLOOR_RATIO;
  if (next < floor) next = floor;

  // Round to 4 decimal places (matches existing behaviour)
  marketData[asset] = parseFloat(next.toFixed(4));
  return marketData[asset];
}

// Initialise regime on startup
refreshRegime();

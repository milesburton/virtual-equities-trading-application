export const TIME_SCALE = Number(Deno.env.get("TIME_SCALE")) || 60;

export const TRADING_DAY_MINUTES = 390;

export function currentMarketMinute(): number {
  const elapsedSecs = (Date.now() / 1_000) % (TRADING_DAY_MINUTES * (1_000 / TIME_SCALE) / 1_000);
  return Math.floor(elapsedSecs * TIME_SCALE) % TRADING_DAY_MINUTES;
}

// U-shaped: cos²(π*x) peaks at x=0 (open) and x=1 (close), troughs at x=0.5 (midday).
// Returns [0.3, 1.0].
export function intradayVolumeFactor(marketMinute: number): number {
  const x = marketMinute / TRADING_DAY_MINUTES;
  const cos = Math.cos(Math.PI * x);
  return 0.3 + 0.7 * cos * cos;
}

export function realMsToMarketMinutes(ms: number): number {
  return (ms / 1_000) * TIME_SCALE;
}

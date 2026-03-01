import { ASSET_MAP, SP500_ASSETS } from "./sp500Assets.ts";

export const marketData: Record<string, number> = Object.fromEntries(
  SP500_ASSETS.map((a) => [a.symbol, a.initialPrice]),
);

export function generatePrice(asset: string): number {
  const def = ASSET_MAP.get(asset);
  const volatility = def?.volatility ?? 0.02;
  const change = (Math.random() * volatility * 2 - volatility) * marketData[asset];
  marketData[asset] = parseFloat((marketData[asset] + change).toFixed(4));
  return marketData[asset];
}

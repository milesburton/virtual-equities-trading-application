import { useAppSelector } from "../store/hooks.ts";

interface Props {
  symbol: string;
}

const MAX_LEVELS = 12;

export function MarketDepth({ symbol }: Props) {
  const snapshot = useAppSelector((s) => s.market.orderBook[symbol]);

  if (!snapshot) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-600 text-xs bg-gray-950">
        No depth data for {symbol}
      </div>
    );
  }

  const bids = snapshot.bids.slice(0, MAX_LEVELS);
  const asks = snapshot.asks.slice(0, MAX_LEVELS);

  // Max size across all levels for bar scaling
  const maxSize = Math.max(...bids.map((l) => l.size), ...asks.map((l) => l.size), 1);

  const decimals = symbol.includes("/") ? 4 : 2;

  return (
    <div className="flex flex-col h-full bg-gray-950 text-xs">
      {/* Column headers */}
      <div className="grid grid-cols-[1fr_auto_auto] px-3 py-1 border-b border-gray-800/50 text-[10px] text-gray-600 uppercase tracking-wider shrink-0">
        <span title="Number of shares available at this price level">Size</span>
        <span className="text-right pr-4" title="Price level in the order book">
          Price
        </span>
        <span className="text-right w-16" title="Cumulative quantity from best price to this level">
          Cum
        </span>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Asks — shown top-to-bottom, lowest ask at bottom */}
        <div className="flex-1 flex flex-col justify-end overflow-hidden">
          {[...asks].reverse().map((level, i) => {
            const barPct = (level.size / maxSize) * 100;
            const cum = asks.slice(0, asks.length - i).reduce((s, l) => s + l.size, 0);
            return (
              <div
                key={`ask-${level.price}`}
                className="relative grid grid-cols-[1fr_auto_auto] items-center px-3 py-[2px] hover:bg-red-950/20 transition-colors"
              >
                {/* Bar background */}
                <div
                  className="absolute inset-y-0 right-0 bg-red-900/20"
                  style={{ width: `${barPct}%` }}
                />
                <span className="relative font-mono text-[10px] text-gray-400 tabular-nums">
                  {level.size.toLocaleString()}
                </span>
                <span className="relative font-mono text-[11px] text-red-400 tabular-nums pr-4">
                  {level.price.toFixed(decimals)}
                </span>
                <span className="relative font-mono text-[10px] text-gray-600 tabular-nums w-16 text-right">
                  {cum.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>

        {/* Spread indicator */}
        <div
          title={`Spread ${asks.length > 0 && bids.length > 0 ? (asks[0].price - bids[0].price).toFixed(decimals) : "unavailable"}, mid price ${snapshot.mid.toFixed(decimals)}`}
          className="flex items-center justify-center gap-3 py-1 border-y border-gray-800/50 bg-gray-900/40 shrink-0"
        >
          <span
            className="text-[10px] text-gray-500"
            title="Bid-ask spread — difference between best ask and best bid prices"
          >
            Spread{" "}
            <span className="font-mono text-gray-300">
              {asks.length > 0 && bids.length > 0
                ? (asks[0].price - bids[0].price).toFixed(decimals)
                : "—"}
            </span>
          </span>
          <span
            className="text-[10px] font-mono font-semibold text-gray-200"
            title="Mid price — midpoint between best bid and ask"
          >
            {snapshot.mid.toFixed(decimals)}
          </span>
        </div>

        {/* Bids */}
        <div className="flex-1 overflow-hidden">
          {bids.map((level, i) => {
            const barPct = (level.size / maxSize) * 100;
            const cum = bids.slice(0, i + 1).reduce((s, l) => s + l.size, 0);
            return (
              <div
                key={`bid-${level.price}`}
                className="relative grid grid-cols-[1fr_auto_auto] items-center px-3 py-[2px] hover:bg-emerald-950/20 transition-colors"
              >
                <div
                  className="absolute inset-y-0 right-0 bg-emerald-900/20"
                  style={{ width: `${barPct}%` }}
                />
                <span className="relative font-mono text-[10px] text-gray-400 tabular-nums">
                  {level.size.toLocaleString()}
                </span>
                <span className="relative font-mono text-[11px] text-emerald-400 tabular-nums pr-4">
                  {level.price.toFixed(decimals)}
                </span>
                <span className="relative font-mono text-[10px] text-gray-600 tabular-nums w-16 text-right">
                  {cum.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

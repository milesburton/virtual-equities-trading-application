import { useSignal } from "@preact/signals-react";
import { useMemo } from "react";
import { useChannelContext } from "../contexts/ChannelContext.tsx";
import { useChannelIn } from "../hooks/useChannelIn.ts";
import { useAppSelector } from "../store/hooks.ts";
import type { ContextMenuEntry } from "./ContextMenu.tsx";
import { ContextMenu } from "./ContextMenu.tsx";

interface FillEvent {
  ts: number;
  asset: string;
  side: "BUY" | "SELL";
  filledQty: number;
  avgFillPrice: number;
  marketImpactBps?: number;
  venue?: string;
  counterparty?: string;
  liquidityFlag?: "MAKER" | "TAKER" | "CROSS";
  commissionUSD?: number;
  algo?: string;
  parentOrderId?: string;
  childId?: string;
  midPrice?: number;
}

const LIQ_STYLES = {
  MAKER: {
    text: "text-emerald-400",
    bg: "bg-emerald-900/30",
    label: "MAKER",
    title: "Passive — added liquidity to the book (typically lower fees)",
  },
  TAKER: {
    text: "text-amber-400",
    bg: "bg-amber-900/30",
    label: "TAKER",
    title: "Aggressive — removed liquidity from the book",
  },
  CROSS: {
    text: "text-sky-400",
    bg: "bg-sky-900/30",
    label: "CROSS",
    title: "Internal cross — matched against another internal order",
  },
};

const VENUE_FLAGS: Record<string, string> = {
  XNAS: "US",
  XNYS: "US",
  ARCX: "US",
  BATS: "US",
  XBOS: "US",
  XPHL: "US",
  IEXG: "US",
  XCBO: "US",
};

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatPrice(p: number, symbol: string) {
  return symbol.includes("/") ? p.toFixed(4) : p.toFixed(2);
}

function formatQty(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n % 1 === 0 ? n.toLocaleString() : n.toFixed(1);
}

/** Mini horizontal bar showing buy vs sell imbalance */
function FlowBar({ buys, sells }: { buys: number; sells: number }) {
  const total = buys + sells;
  if (total === 0) return null;
  const buyPct = (buys / total) * 100;
  return (
    <div
      className="flex h-1.5 rounded overflow-hidden w-full"
      title={`Buy: ${formatQty(buys)} / Sell: ${formatQty(sells)}`}
    >
      <div className="bg-emerald-500 transition-all duration-500" style={{ width: `${buyPct}%` }} />
      <div className="bg-red-500 flex-1 transition-all duration-500" />
    </div>
  );
}

/** Show where our order sits relative to current order book */
function BookPosition({
  symbol,
  orderPrice,
  side,
}: {
  symbol: string;
  orderPrice: number;
  side: "BUY" | "SELL";
}) {
  const snapshot = useAppSelector((s) => s.market.orderBook[symbol]);
  if (!snapshot) return null;

  const { bids, asks, mid } = snapshot;
  const bestBid = bids[0]?.price ?? mid;
  const bestAsk = asks[0]?.price ?? mid;
  const spread = bestAsk - bestBid;

  // Position relative to spread: 0 = at bid, 1 = at ask
  const pos = spread > 0 ? (orderPrice - bestBid) / spread : 0.5;
  const clamped = Math.max(0, Math.min(1, pos));

  const isPassive =
    (side === "BUY" && orderPrice <= bestBid) || (side === "SELL" && orderPrice >= bestAsk);

  return (
    <div
      className="flex flex-col gap-0.5"
      title={`Fill price ${formatPrice(orderPrice, symbol)} vs bid ${formatPrice(bestBid, symbol)} / ask ${formatPrice(bestAsk, symbol)}`}
    >
      <div className="relative h-2 w-full bg-gray-800 rounded overflow-hidden">
        {/* Bid zone */}
        <div className="absolute inset-y-0 left-0 w-1/2 bg-emerald-900/30" />
        {/* Ask zone */}
        <div className="absolute inset-y-0 right-0 w-1/2 bg-red-900/30" />
        {/* Order position marker */}
        <div
          className={`absolute top-0 bottom-0 w-0.5 ${isPassive ? "bg-emerald-400" : "bg-amber-400"}`}
          style={{ left: `${clamped * 100}%` }}
        />
      </div>
      <div className="flex justify-between text-[8px] text-gray-700">
        <span>BID {formatPrice(bestBid, symbol)}</span>
        <span>ASK {formatPrice(bestAsk, symbol)}</span>
      </div>
    </div>
  );
}

export function MarketMatch() {
  const events = useAppSelector((s) => s.observability.events);
  const { incoming } = useChannelContext();
  const channelIn = useChannelIn();
  const filterAsset = incoming !== null ? (channelIn.selectedAsset ?? null) : null;
  const ctxMenu = useSignal<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);

  function openFillCtxMenu(e: React.MouseEvent, f: FillEvent) {
    e.preventDefault();
    const sym = f.asset || filterAsset || "";
    const items: ContextMenuEntry[] = [
      {
        label: `Copy symbol: ${sym}`,
        icon: "⎘",
        disabled: !sym,
        onClick: () => navigator.clipboard.writeText(sym),
      },
      {
        label: `Copy fill price: ${f.avgFillPrice.toFixed(2)}`,
        icon: "⎘",
        onClick: () => navigator.clipboard.writeText(f.avgFillPrice.toFixed(2)),
      },
      { separator: true },
      {
        label: "Copy order ID",
        icon: "⎘",
        disabled: !f.parentOrderId,
        onClick: () => {
          if (f.parentOrderId) navigator.clipboard.writeText(f.parentOrderId);
        },
      },
    ];
    ctxMenu.value = { x: e.clientX, y: e.clientY, items };
  }

  // Extract fill events
  const fills: FillEvent[] = useMemo(() => {
    return events
      .filter((e) => e.type === "orders.filled")
      .map((e) => {
        const p = e.payload as Record<string, unknown>;
        return {
          ts: (p.ts as number) ?? e.ts ?? 0,
          asset: (p.asset as string) ?? "",
          side: (p.side as "BUY" | "SELL") ?? "BUY",
          filledQty: (p.filledQty as number) ?? 0,
          avgFillPrice: (p.avgFillPrice as number) ?? 0,
          marketImpactBps: p.marketImpactBps as number | undefined,
          venue: p.venue as string | undefined,
          counterparty: p.counterparty as string | undefined,
          liquidityFlag: p.liquidityFlag as "MAKER" | "TAKER" | "CROSS" | undefined,
          commissionUSD: p.commissionUSD as number | undefined,
          algo: p.algo as string | undefined,
          parentOrderId: p.parentOrderId as string | undefined,
          childId: p.childId as string | undefined,
          midPrice: p.midPrice as number | undefined,
        };
      })
      .filter((f) => !filterAsset || f.asset === filterAsset)
      .slice(0, 200);
  }, [events, filterAsset]);

  // Aggregate stats
  const stats = useMemo(() => {
    const buyVol = fills.filter((f) => f.side === "BUY").reduce((s, f) => s + f.filledQty, 0);
    const sellVol = fills.filter((f) => f.side === "SELL").reduce((s, f) => s + f.filledQty, 0);
    const makerVol = fills
      .filter((f) => f.liquidityFlag === "MAKER")
      .reduce((s, f) => s + f.filledQty, 0);
    const takerVol = fills
      .filter((f) => f.liquidityFlag === "TAKER")
      .reduce((s, f) => s + f.filledQty, 0);
    const totalComm = fills.reduce((s, f) => s + (f.commissionUSD ?? 0), 0);
    const avgImpact =
      fills.length > 0 ? fills.reduce((s, f) => s + (f.marketImpactBps ?? 0), 0) / fills.length : 0;

    // Venue breakdown
    const venues: Record<string, number> = {};
    for (const f of fills) {
      if (f.venue) venues[f.venue] = (venues[f.venue] ?? 0) + f.filledQty;
    }

    return { buyVol, sellVol, makerVol, takerVol, totalComm, avgImpact, venues };
  }, [fills]);

  const asset = filterAsset ?? fills[0]?.asset ?? "";

  return (
    <div className="flex flex-col h-full text-xs">
      {ctxMenu.value && (
        <ContextMenu
          items={ctxMenu.value.items}
          x={ctxMenu.value.x}
          y={ctxMenu.value.y}
          onClose={() => {
            ctxMenu.value = null;
          }}
        />
      )}
      {/* Header */}
      <div className="px-3 py-1.5 border-b border-gray-800 flex items-center gap-2 shrink-0">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
          Market Match
        </span>
        {filterAsset && (
          <span className="text-[10px] text-sky-400 bg-sky-900/30 rounded px-1.5 py-0.5">
            {filterAsset}
          </span>
        )}
        <span className="ml-auto text-[10px] text-gray-600 tabular-nums">{fills.length} fills</span>
      </div>

      {fills.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-600 text-xs">
          {filterAsset
            ? `No fills for ${filterAsset} yet`
            : "No fills recorded yet — submit an order to see matching activity"}
        </div>
      ) : (
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Stats summary bar */}
          <div className="px-3 py-2 border-b border-gray-800 grid grid-cols-5 gap-3 text-[10px] shrink-0">
            <div>
              <div className="text-gray-600 mb-0.5">Buy / Sell flow</div>
              <FlowBar buys={stats.buyVol} sells={stats.sellVol} />
              <div className="flex justify-between text-gray-500 mt-0.5 tabular-nums">
                <span className="text-emerald-500">{formatQty(stats.buyVol)}</span>
                <span className="text-red-400">{formatQty(stats.sellVol)}</span>
              </div>
            </div>
            <div>
              <div
                className="text-gray-600 mb-0.5"
                title="Maker = passive (lower fees). Taker = aggressive."
              >
                Maker / Taker
              </div>
              <FlowBar buys={stats.makerVol} sells={stats.takerVol} />
              <div className="flex justify-between text-gray-500 mt-0.5 tabular-nums">
                <span className="text-emerald-500">{formatQty(stats.makerVol)}</span>
                <span className="text-amber-400">{formatQty(stats.takerVol)}</span>
              </div>
            </div>
            <div>
              <div
                className="text-gray-600 mb-0.5"
                title="Average market impact across all fills in basis points"
              >
                Avg Impact
              </div>
              <div
                className={`font-semibold tabular-nums ${stats.avgImpact > 5 ? "text-red-400" : stats.avgImpact < -2 ? "text-emerald-400" : "text-gray-300"}`}
              >
                {stats.avgImpact > 0 ? "+" : ""}
                {stats.avgImpact.toFixed(1)}bp
              </div>
            </div>
            <div>
              <div className="text-gray-600 mb-0.5" title="Total commission and fees paid">
                Commission
              </div>
              <div className="tabular-nums text-amber-400">${stats.totalComm.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-gray-600 mb-0.5" title="Execution venues by share volume">
                Top venues
              </div>
              <div className="flex flex-col gap-px">
                {Object.entries(stats.venues)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 2)
                  .map(([v, vol]) => (
                    <div key={v} className="flex justify-between text-gray-500">
                      <span>
                        {VENUE_FLAGS[v] ?? ""} {v}
                      </span>
                      <span className="tabular-nums">{formatQty(vol)}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* Fill tape */}
          <div className="flex-1 overflow-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-gray-600 border-b border-gray-800 sticky top-0 bg-gray-950 text-[9px] uppercase tracking-wider">
                  <th className="text-left px-3 py-1.5" title="Fill timestamp">
                    Time
                  </th>
                  <th className="text-left px-2 py-1.5" title="Buy or Sell">
                    Side
                  </th>
                  <th className="text-left px-2 py-1.5" title="Instrument">
                    Asset
                  </th>
                  <th className="text-right px-2 py-1.5" title="Quantity filled">
                    Qty
                  </th>
                  <th className="text-right px-2 py-1.5" title="Average fill price">
                    Fill Px
                  </th>
                  <th
                    className="text-left px-2 py-1.5"
                    title="Book position relative to bid/ask at fill time"
                  >
                    Book Position
                  </th>
                  <th
                    className="text-left px-2 py-1.5"
                    title="Liquidity flag — MAKER added liquidity, TAKER removed it"
                  >
                    Liq
                  </th>
                  <th className="text-left px-2 py-1.5" title="Execution venue (exchange MIC code)">
                    Venue
                  </th>
                  <th
                    className="text-left px-2 py-1.5"
                    title="Counterparty on the other side of the trade"
                  >
                    Counterparty
                  </th>
                  <th
                    className="text-right px-2 py-1.5"
                    title="Market impact vs arrival price in basis points (1bp = 0.01%)"
                  >
                    Impact
                  </th>
                  <th className="text-right pr-3 py-1.5" title="Commission charged for this fill">
                    Comm
                  </th>
                </tr>
              </thead>
              <tbody>
                {fills.map((f) => {
                  const liq = f.liquidityFlag ? LIQ_STYLES[f.liquidityFlag] : null;
                  const isBuy = f.side === "BUY";
                  return (
                    <tr
                      key={`${f.ts}-${f.asset}-${f.parentOrderId ?? ""}-${f.side}`}
                      className="border-b border-gray-800/30 hover:bg-gray-900/40 transition-colors cursor-context-menu"
                      onContextMenu={(e) => openFillCtxMenu(e, f)}
                      title="Right-click for options"
                    >
                      <td className="pl-3 pr-2 py-1.5 text-gray-600 tabular-nums whitespace-nowrap">
                        {formatTime(f.ts)}
                      </td>
                      <td
                        className={`px-2 py-1.5 font-semibold ${isBuy ? "text-emerald-400" : "text-red-400"}`}
                      >
                        {f.side}
                      </td>
                      <td className="px-2 py-1.5 text-gray-300 font-semibold">
                        {f.asset || asset}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-gray-200">
                        {formatQty(f.filledQty)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-mono text-gray-200">
                        {formatPrice(f.avgFillPrice, f.asset || asset)}
                      </td>
                      <td className="px-2 py-1.5 w-32">
                        <BookPosition
                          symbol={f.asset || asset}
                          orderPrice={f.avgFillPrice}
                          side={f.side}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        {liq ? (
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold ${liq.text} ${liq.bg}`}
                            title={liq.title}
                          >
                            {liq.label}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-gray-500 font-mono">
                        {f.venue ? (
                          <span title={`Execution venue: ${f.venue}`}>
                            {VENUE_FLAGS[f.venue] ?? ""} {f.venue}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-gray-500">{f.counterparty ?? "—"}</td>
                      <td
                        className={`px-2 py-1.5 text-right tabular-nums text-[9px] font-semibold ${
                          f.marketImpactBps != null
                            ? f.marketImpactBps > 5
                              ? "text-red-400"
                              : f.marketImpactBps < -2
                                ? "text-emerald-400"
                                : "text-gray-500"
                            : "text-gray-700"
                        }`}
                      >
                        {f.marketImpactBps != null
                          ? `${f.marketImpactBps > 0 ? "+" : ""}${f.marketImpactBps.toFixed(1)}bp`
                          : "—"}
                      </td>
                      <td className="pr-3 pl-2 py-1.5 text-right tabular-nums text-gray-600 text-[9px]">
                        {f.commissionUSD != null ? `$${f.commissionUSD.toFixed(2)}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

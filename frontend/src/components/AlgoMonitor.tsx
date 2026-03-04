import { useSignal } from "@preact/signals-react";
import { useChannelIn } from "../hooks/useChannelIn.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { submitOrderThunk } from "../store/ordersSlice.ts";
import type { ChildOrder, LiquidityFlag, OrderRecord } from "../types.ts";
import { PopOutButton } from "./PopOutButton.tsx";

type ViewTab = "active" | "needs-action" | "history";

interface TradePerf {
  avgFillPx: number;
  arrivalPx: number;
  marketImpactBps: number;
  marketImpactUSD: number;
  totalCommission: number;
  fillRate: number;
  sliceCount: number;
  makerPct: number;
  takerPct: number;
  crossPct: number;
}

function computePerf(order: OrderRecord): TradePerf | null {
  const filled = order.children.filter((c) => c.status === "filled" && c.filled > 0);
  if (filled.length === 0) return null;

  const totalFilled = filled.reduce((s, c) => s + c.filled, 0);
  const totalValue = filled.reduce((s, c) => s + (c.avgFillPrice ?? c.limitPrice) * c.filled, 0);
  const avgFillPx = totalFilled > 0 ? totalValue / totalFilled : 0;
  const arrivalPx = order.limitPrice;

  const rawImpact =
    order.side === "BUY"
      ? (avgFillPx - arrivalPx) / arrivalPx
      : (arrivalPx - avgFillPx) / arrivalPx;
  const marketImpactBps = rawImpact * 10_000;
  const marketImpactUSD = (avgFillPx - arrivalPx) * totalFilled * (order.side === "BUY" ? 1 : -1);

  const totalCommission = filled.reduce((s, c) => s + (c.commissionUSD ?? 0), 0);

  const countByFlag = (flag: LiquidityFlag) =>
    filled.filter((c) => c.liquidityFlag === flag).reduce((s, c) => s + c.filled, 0);
  const makerQty = countByFlag("MAKER");
  const takerQty = countByFlag("TAKER");
  const crossQty = countByFlag("CROSS");

  return {
    avgFillPx,
    arrivalPx,
    marketImpactBps,
    marketImpactUSD,
    totalCommission,
    fillRate: order.quantity > 0 ? (order.filled / order.quantity) * 100 : 0,
    sliceCount: filled.length,
    makerPct: totalFilled > 0 ? (makerQty / totalFilled) * 100 : 0,
    takerPct: totalFilled > 0 ? (takerQty / totalFilled) * 100 : 0,
    crossPct: totalFilled > 0 ? (crossQty / totalFilled) * 100 : 0,
  };
}

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.min(pct, 100);
  const colour = clamped >= 100 ? "bg-emerald-500" : clamped >= 50 ? "bg-sky-500" : "bg-amber-500";
  return (
    <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ease-out ${colour}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

function formatQty(n: number) {
  return n % 1 === 0 ? n.toLocaleString() : n.toFixed(1);
}

function formatPrice(price: number) {
  return price.toFixed(2);
}

function formatBps(bps: number) {
  const sign = bps > 0 ? "+" : "";
  return `${sign}${bps.toFixed(1)}bp`;
}

const LIQ_STYLES: Record<LiquidityFlag, string> = {
  MAKER: "text-emerald-500",
  TAKER: "text-amber-500",
  CROSS: "text-sky-500",
};

function PerfCard({ perf, order }: { perf: TradePerf; order: OrderRecord }) {
  const impactColor =
    perf.marketImpactBps > 5
      ? "text-red-400"
      : perf.marketImpactBps < -2
        ? "text-emerald-400"
        : "text-gray-300";
  const commColor = perf.totalCommission < 0 ? "text-emerald-400" : "text-amber-400";

  return (
    <div className="bg-gray-900/60 border border-gray-700/60 rounded mx-3 my-1 p-2 grid grid-cols-4 gap-x-4 gap-y-1.5 text-[10px]">
      <div>
        <div className="text-gray-500 uppercase tracking-wide">Avg Fill</div>
        <div className="text-gray-200 tabular-nums font-mono">{perf.avgFillPx.toFixed(4)}</div>
      </div>
      <div>
        <div className="text-gray-500 uppercase tracking-wide">Arrival Px</div>
        <div className="text-gray-300 tabular-nums font-mono">{perf.arrivalPx.toFixed(4)}</div>
      </div>
      <div>
        <div className="text-gray-500 uppercase tracking-wide">Mkt Impact</div>
        <div className={`tabular-nums font-semibold ${impactColor}`}>
          {formatBps(perf.marketImpactBps)}
        </div>
      </div>
      <div>
        <div className="text-gray-500 uppercase tracking-wide">Impact $</div>
        <div className={`tabular-nums ${impactColor}`}>
          {perf.marketImpactUSD >= 0 ? "+" : ""}${perf.marketImpactUSD.toFixed(2)}
        </div>
      </div>
      <div>
        <div className="text-gray-500 uppercase tracking-wide">Fill Rate</div>
        <div className="text-gray-200 tabular-nums">{perf.fillRate.toFixed(1)}%</div>
      </div>
      <div>
        <div className="text-gray-500 uppercase tracking-wide">Slices</div>
        <div className="text-gray-200 tabular-nums">{perf.sliceCount}</div>
      </div>
      <div>
        <div className="text-gray-500 uppercase tracking-wide">Commission</div>
        <div className={`tabular-nums font-semibold ${commColor}`}>
          {perf.totalCommission < 0 ? "" : "+"}${perf.totalCommission.toFixed(2)}
        </div>
      </div>
      <div>
        <div className="text-gray-500 uppercase tracking-wide">Side</div>
        <div
          className={`font-semibold ${order.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}
        >
          {order.side}
        </div>
      </div>
      <div className="col-span-4 flex items-center gap-3 pt-0.5">
        <span className="text-gray-500 uppercase tracking-wide">Liquidity:</span>
        <span className={LIQ_STYLES.MAKER}>MAKER {perf.makerPct.toFixed(0)}%</span>
        <span className={LIQ_STYLES.TAKER}>TAKER {perf.takerPct.toFixed(0)}%</span>
        {perf.crossPct > 0 && (
          <span className={LIQ_STYLES.CROSS}>CROSS {perf.crossPct.toFixed(0)}%</span>
        )}
      </div>
    </div>
  );
}

function ChildRows({ rows, asset }: { rows: ChildOrder[]; asset: string }) {
  return (
    <>
      {rows.map((c) => (
        <tr key={c.id} className="bg-gray-900/30 border-b border-gray-800/20">
          <td className="pl-8 pr-3 py-1 text-gray-500 font-mono tabular-nums whitespace-nowrap">
            {new Date(c.submittedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </td>
          <td
            className={`px-3 py-1 text-[10px] font-semibold ${c.side === "BUY" ? "text-emerald-600" : "text-red-600"}`}
          >
            {c.side}
          </td>
          <td className="px-3 py-1 text-gray-500">{asset}</td>
          <td className="px-3 py-1 text-right tabular-nums text-emerald-500">
            {formatQty(c.filled)}
          </td>
          <td className="px-3 py-1 text-right tabular-nums text-gray-400">
            {(c.avgFillPrice ?? c.limitPrice).toFixed(4)}
          </td>
          <td
            className={`px-3 py-1 text-[10px] font-semibold ${c.liquidityFlag ? LIQ_STYLES[c.liquidityFlag] : "text-gray-600"}`}
          >
            {c.liquidityFlag ?? "—"}
          </td>
          <td className="px-3 py-1 text-gray-500 font-mono text-[10px]">
            {c.venue ? <span className="bg-gray-800 rounded px-1">{c.venue}</span> : "—"}
          </td>
          <td className="px-3 py-1 text-gray-500 font-mono text-[10px]">{c.counterparty ?? "—"}</td>
          <td className="px-3 py-1 text-right tabular-nums text-gray-500 text-[10px]">
            {c.commissionUSD !== undefined ? (
              <span className={c.commissionUSD < 0 ? "text-emerald-600" : "text-amber-600"}>
                ${c.commissionUSD.toFixed(2)}
              </span>
            ) : (
              "—"
            )}
          </td>
        </tr>
      ))}
    </>
  );
}

function TradeAtLastButton({
  order,
  marketPrice,
}: {
  order: OrderRecord;
  marketPrice: number | undefined;
}) {
  const dispatch = useAppDispatch();
  const remaining = order.quantity - order.filled;

  if (remaining <= 0 || !marketPrice) return null;

  function handleTradeAtLast() {
    dispatch(
      submitOrderThunk({
        asset: order.asset,
        side: order.side,
        quantity: remaining,
        limitPrice: marketPrice as number,
        expiresAt: 60,
        algoParams: { strategy: "LIMIT" },
      })
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        handleTradeAtLast();
      }}
      className="px-2 py-0.5 text-[10px] font-semibold rounded border border-amber-600/60 text-amber-400 hover:bg-amber-900/30 transition-colors whitespace-nowrap"
      title={`Submit LIMIT order for ${formatQty(remaining)} @ ${marketPrice ? formatPrice(marketPrice) : "—"}`}
    >
      Trade at Last
    </button>
  );
}

export function AlgoMonitor() {
  const orders = useAppSelector((s) => s.orders.orders);
  const prices = useAppSelector((s) => s.market.prices);
  const channelIn = useChannelIn();
  const linkedOrderId = channelIn.selectedOrderId;
  const stratFilter = useSignal("ALL");
  const tab = useSignal<ViewTab>("active");
  const expandedPerf = useSignal<Set<string>>(new Set());

  function togglePerf(id: string) {
    const next = new Set(expandedPerf.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expandedPerf.value = next;
  }

  const filterStrat = (o: OrderRecord) =>
    stratFilter.value === "ALL" || o.strategy === stratFilter.value;

  const activeOrders = orders.filter(
    (o) => (o.status === "queued" || o.status === "executing") && filterStrat(o)
  );

  const needsActionOrders = orders.filter(
    (o) =>
      o.filled < o.quantity &&
      (o.status === "expired" ||
        (o.status === "executing" && o.filled === 0 && Date.now() - o.submittedAt > 30_000)) &&
      filterStrat(o)
  );

  const historyOrders = orders.filter(
    (o) => (o.status === "filled" || o.status === "expired") && filterStrat(o)
  );

  const displayed =
    tab.value === "active"
      ? activeOrders
      : tab.value === "needs-action"
        ? needsActionOrders
        : historyOrders;

  const isNeedsAction = tab.value === "needs-action";
  const colSpan = isNeedsAction ? 12 : 11;

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-1.5 border-b border-gray-800 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="flex rounded overflow-hidden border border-gray-700 text-[11px]">
            <button
              type="button"
              title="Orders currently queued or executing"
              aria-pressed={tab.value === "active"}
              onClick={() => {
                tab.value = "active";
              }}
              className={`px-2.5 py-1 transition-colors ${tab.value === "active" ? "bg-sky-900/60 text-sky-300" : "text-gray-500 hover:text-gray-300"}`}
            >
              Active
              {activeOrders.length > 0 && (
                <span className="ml-1 text-[9px] bg-sky-800/60 text-sky-400 rounded px-1">
                  {activeOrders.length}
                </span>
              )}
            </button>
            <button
              type="button"
              title="Expired or stalled orders with unfilled quantity that may need manual intervention"
              aria-pressed={tab.value === "needs-action"}
              onClick={() => {
                tab.value = "needs-action";
              }}
              className={`px-2.5 py-1 transition-colors ${tab.value === "needs-action" ? "bg-amber-900/60 text-amber-300" : "text-gray-500 hover:text-gray-300"}`}
            >
              Needs Action
              {needsActionOrders.length > 0 && (
                <span className="ml-1 text-[9px] bg-amber-800/60 text-amber-400 rounded px-1">
                  {needsActionOrders.length}
                </span>
              )}
            </button>
            <button
              type="button"
              title="Completed orders — filled or expired. Click a row to view execution performance."
              aria-pressed={tab.value === "history"}
              onClick={() => {
                tab.value = "history";
              }}
              className={`px-2.5 py-1 transition-colors ${tab.value === "history" ? "bg-gray-700/80 text-gray-200" : "text-gray-500 hover:text-gray-300"}`}
            >
              History
              {historyOrders.length > 0 && (
                <span className="ml-1 text-[9px] bg-gray-700 text-gray-400 rounded px-1">
                  {historyOrders.length}
                </span>
              )}
            </button>
          </div>
          <select
            aria-label="Filter by strategy"
            title="Show only orders using this execution strategy"
            value={stratFilter.value}
            onChange={(e) => {
              stratFilter.value = e.target.value;
            }}
            className="bg-gray-800 text-xs text-gray-300 rounded px-2 py-0.5 border border-gray-700"
          >
            <option value="ALL">All</option>
            <option value="LIMIT">Limit</option>
            <option value="TWAP">TWAP</option>
            <option value="POV">POV</option>
            <option value="VWAP">VWAP</option>
          </select>
        </div>
        <PopOutButton panelId="algo-monitor" />
      </div>

      <div className="overflow-auto flex-1">
        {displayed.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-gray-600 text-xs">
            {tab.value === "active"
              ? "No active algo orders"
              : tab.value === "needs-action"
                ? "No orders need attention"
                : "No completed orders yet"}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800 sticky top-0 bg-gray-950">
                <th className="text-left px-3 py-2" title="Instrument being traded">
                  Asset
                </th>
                <th className="text-left px-3 py-2" title="Order direction: BUY or SELL">
                  Side
                </th>
                <th
                  className="text-left px-3 py-2"
                  title="Execution algorithm: LIMIT, TWAP, POV, or VWAP"
                >
                  Strategy
                </th>
                <th className="text-right px-3 py-2" title="Quantity filled so far">
                  Filled
                </th>
                <th className="text-right px-3 py-2" title="Remaining quantity not yet filled">
                  Unfilled
                </th>
                <th className="text-right px-3 py-2" title="Total order quantity">
                  Total
                </th>
                <th className="px-3 py-2 w-28" title="Fill completion percentage">
                  Progress
                </th>
                <th
                  className="text-right px-3 py-2"
                  title="Original limit price submitted with the order"
                >
                  Limit
                </th>
                <th
                  className="text-right px-3 py-2"
                  title="Current market price — green if order is in-the-money"
                >
                  Last
                </th>
                <th
                  className="text-right px-3 py-2"
                  title="Market impact in basis points (1bp = 0.01%) — measures execution quality vs arrival price. Positive = paid more than arrival, negative = better than arrival"
                >
                  Impact
                </th>
                <th className="text-right px-3 py-2" title="Total execution commission in USD">
                  Comm
                </th>
                {isNeedsAction && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {displayed.map((order) => {
                const pct = order.quantity > 0 ? (order.filled / order.quantity) * 100 : 0;
                const unfilled = order.quantity - order.filled;
                const secsLeft = Math.max(0, Math.round((order.expiresAt - Date.now()) / 1_000));
                const marketPrice = prices[order.asset];
                const isLinked = linkedOrderId !== null && linkedOrderId === order.id;
                const isExpanded = expandedPerf.value.has(order.id);
                const perf = computePerf(order);

                return (
                  <>
                    <tr
                      key={order.id}
                      onClick={() => togglePerf(order.id)}
                      className={`border-b border-gray-800/40 cursor-pointer transition-colors ${
                        isLinked
                          ? "bg-sky-900/20 border-l-2 border-l-sky-500"
                          : isNeedsAction
                            ? "bg-amber-950/10 hover:bg-amber-900/10"
                            : "hover:bg-gray-800/20"
                      }`}
                    >
                      <td className="px-3 py-2 font-semibold text-gray-200">{order.asset}</td>
                      <td
                        className={`px-3 py-2 font-semibold ${order.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}
                      >
                        {order.side}
                      </td>
                      <td className="px-3 py-2 text-gray-400">{order.strategy}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-400">
                        {formatQty(order.filled)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-400">
                        {unfilled > 0 ? (
                          formatQty(unfilled)
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-300">
                        {formatQty(order.quantity)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <ProgressBar pct={pct} />
                          <span className="text-gray-500 tabular-nums w-10 text-right shrink-0">
                            {pct.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-400">
                        {formatPrice(order.limitPrice)}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${
                          marketPrice !== undefined
                            ? (order.side === "BUY" && marketPrice <= order.limitPrice) ||
                              (order.side === "SELL" && marketPrice >= order.limitPrice)
                              ? "text-emerald-400"
                              : "text-gray-400"
                            : "text-gray-600"
                        }`}
                      >
                        {marketPrice !== undefined ? formatPrice(marketPrice) : "—"}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums text-[10px] ${
                          perf
                            ? perf.marketImpactBps > 5
                              ? "text-red-400"
                              : perf.marketImpactBps < -2
                                ? "text-emerald-400"
                                : "text-gray-400"
                            : "text-gray-600"
                        }`}
                      >
                        {perf ? formatBps(perf.marketImpactBps) : "—"}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums text-[10px] ${
                          perf
                            ? perf.totalCommission < 0
                              ? "text-emerald-500"
                              : "text-amber-500"
                            : "text-gray-600"
                        }`}
                      >
                        {perf ? `$${perf.totalCommission.toFixed(2)}` : "—"}
                      </td>
                      {isNeedsAction && (
                        <td className="px-3 py-2">
                          <TradeAtLastButton order={order} marketPrice={marketPrice} />
                        </td>
                      )}
                    </tr>

                    {isExpanded && (
                      <tr key={`${order.id}-expanded`}>
                        <td colSpan={colSpan} className="p-0">
                          {perf && <PerfCard perf={perf} order={order} />}
                          {order.children.length > 0 && (
                            <div className="mx-3 mb-2">
                              <div className="text-[10px] text-gray-600 uppercase tracking-wide px-1 pb-0.5">
                                Executions ({order.children.length})
                              </div>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-gray-600 border-b border-gray-800/40">
                                    <th className="text-left pl-8 pr-3 py-1">Time</th>
                                    <th className="text-left px-3 py-1">Side</th>
                                    <th className="text-left px-3 py-1">Asset</th>
                                    <th className="text-right px-3 py-1">Filled</th>
                                    <th className="text-right px-3 py-1">Fill Px</th>
                                    <th className="text-left px-3 py-1">Liq</th>
                                    <th className="text-left px-3 py-1">Venue</th>
                                    <th className="text-left px-3 py-1">Cpty</th>
                                    <th className="text-right px-3 py-1">Comm</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <ChildRows rows={order.children} asset={order.asset} />
                                </tbody>
                              </table>
                            </div>
                          )}
                          {order.children.length === 0 && !perf && (
                            <div className="text-gray-600 text-[10px] px-4 py-2">
                              No executions yet
                            </div>
                          )}
                        </td>
                      </tr>
                    )}

                    {!isExpanded && (
                      <tr key={`${order.id}-state`} className="border-b border-gray-800/20">
                        <td colSpan={colSpan} className="px-3 py-0.5 text-[10px] text-gray-600">
                          {order.status === "queued" ? (
                            <span className="text-amber-600">
                              Queued — waiting for fill conditions
                            </span>
                          ) : order.status === "expired" ? (
                            <span className="text-gray-500">
                              Expired —{" "}
                              {order.filled > 0
                                ? `${formatQty(order.filled)} of ${formatQty(order.quantity)} filled`
                                : "no fills"}
                            </span>
                          ) : order.status === "filled" ? (
                            <span className="text-emerald-700">
                              Filled — click to view performance
                            </span>
                          ) : (
                            <span className="text-sky-700">
                              {order.strategy === "LIMIT"
                                ? "Monitoring market"
                                : `${secsLeft}s remaining · click to inspect`}
                            </span>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

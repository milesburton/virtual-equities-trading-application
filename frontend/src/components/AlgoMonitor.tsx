import { useSignal } from "@preact/signals-react";
import { useChannelIn } from "../hooks/useChannelIn.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { submitOrderThunk } from "../store/ordersSlice.ts";
import type { ChildOrder, OrderRecord } from "../types.ts";
import { PopOutButton } from "./PopOutButton.tsx";

type ViewTab = "active" | "needs-action";

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

function ChildRows({ rows, asset }: { rows: ChildOrder[]; asset: string }) {
  return (
    <>
      {rows.map((c) => (
        <tr key={c.id} className="bg-gray-900/30">
          <td className="pl-8 pr-3 py-1 text-gray-400 font-mono">
            {new Date(c.submittedAt).toLocaleTimeString()}
          </td>
          <td className="px-3 py-1 text-gray-400">{c.side}</td>
          <td className="px-3 py-1 text-gray-400">{asset}</td>
          <td className="px-3 py-1 text-right text-emerald-400">{formatQty(c.filled)}</td>
          <td className="px-3 py-1 text-right text-gray-300">{formatQty(c.quantity)}</td>
          <td className="px-3 py-1 text-gray-400">child</td>
          <td className="px-3 py-1 text-gray-400">{c.status}</td>
          <td />
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
        // Use market price as the limit — aggressive, crosses the spread
        limitPrice: marketPrice as number,
        // Short TTL: 60 seconds is enough for a near-immediate fill
        expiresAt: 60,
        algoParams: { strategy: "LIMIT" },
      })
    );
  }

  return (
    <button
      type="button"
      onClick={handleTradeAtLast}
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

  const activeOrders = orders.filter(
    (o) =>
      (o.status === "queued" || o.status === "executing") &&
      (stratFilter.value === "ALL" || o.strategy === stratFilter.value)
  );

  // Partially filled orders that have expired or stalled — need trader action
  const needsActionOrders = orders.filter(
    (o) =>
      o.filled < o.quantity &&
      (o.status === "expired" ||
        // executing but filled nothing yet after 30 s — show as needing attention
        (o.status === "executing" && o.filled === 0 && Date.now() - o.submittedAt > 30_000)) &&
      (stratFilter.value === "ALL" || o.strategy === stratFilter.value)
  );

  const displayed = tab.value === "active" ? activeOrders : needsActionOrders;

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="px-3 py-2 border-b border-gray-700 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {/* Tab switcher */}
          <div className="flex rounded overflow-hidden border border-gray-700 text-[11px]">
            <button
              type="button"
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
          </div>

          {/* Strategy filter */}
          <select
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

      {/* ── Body ── */}
      <div className="overflow-auto flex-1">
        {displayed.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-gray-600 text-xs">
            {tab.value === "active" ? "No active algo orders" : "No orders need attention"}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800 sticky top-0 bg-gray-950">
                <th className="text-left px-3 py-2">Asset</th>
                <th className="text-left px-3 py-2">Side</th>
                <th className="text-left px-3 py-2">Strategy</th>
                <th className="text-right px-3 py-2">Filled</th>
                <th className="text-right px-3 py-2">Unfilled</th>
                <th className="text-right px-3 py-2">Total</th>
                <th className="px-3 py-2 w-28">Progress</th>
                <th className="text-right px-3 py-2">Limit</th>
                <th className="text-right px-3 py-2">Last</th>
                <th className="text-left px-3 py-2">State</th>
                {tab.value === "needs-action" && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {displayed.map((order) => {
                const pct = order.quantity > 0 ? (order.filled / order.quantity) * 100 : 0;
                const unfilled = order.quantity - order.filled;
                const secsLeft = Math.max(0, Math.round((order.expiresAt - Date.now()) / 1_000));
                const marketPrice = prices[order.asset];
                const isNeedsAction = tab.value === "needs-action";

                const isLinked = linkedOrderId !== null && linkedOrderId === order.id;
                return (
                  <>
                    <tr
                      key={order.id}
                      className={`border-b border-gray-800/40 hover:bg-gray-800/20 transition-colors ${
                        isLinked
                          ? "bg-sky-900/20 border-l-2 border-l-sky-500"
                          : isNeedsAction
                            ? "bg-amber-950/10"
                            : ""
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
                      <td className="px-3 py-2">
                        {order.status === "queued" ? (
                          <span className="text-amber-400">Waiting</span>
                        ) : order.status === "expired" ? (
                          <span className="text-gray-500">Expired</span>
                        ) : (
                          <span className="text-sky-400">
                            {order.strategy === "LIMIT" ? "Monitoring" : `${secsLeft}s left`}
                          </span>
                        )}
                      </td>
                      {isNeedsAction && (
                        <td className="px-3 py-2">
                          <TradeAtLastButton order={order} marketPrice={marketPrice} />
                        </td>
                      )}
                    </tr>
                    {order.children.length > 0 && (
                      <tr key={`${order.id}-children`}>
                        <td colSpan={isNeedsAction ? 11 : 10} className="p-0">
                          <table className="w-full text-xs">
                            <tbody>
                              <ChildRows rows={order.children} asset={order.asset} />
                            </tbody>
                          </table>
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

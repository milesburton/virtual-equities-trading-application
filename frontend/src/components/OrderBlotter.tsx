import { useSignal } from "@preact/signals-react";
import { useAppSelector } from "../store/hooks.ts";
import type { ChildOrder, OrderStatus } from "../types.ts";
import { PopOutButton } from "./PopOutButton.tsx";

const STATUS_STYLES: Record<OrderStatus, string> = {
  queued: "bg-amber-900/50 text-amber-300 border border-amber-700/50",
  executing: "bg-sky-900/50 text-sky-300 border border-sky-700/50",
  filled: "bg-emerald-900/50 text-emerald-300 border border-emerald-700/50",
  expired: "bg-gray-800/50 text-gray-500 border border-gray-700/50",
};

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatPrice(asset: string, price: number) {
  return asset.includes("/") ? price.toFixed(4) : price.toFixed(2);
}

function avgFillPrice(children: ChildOrder[]): string {
  const filled = children.filter((c) => c.status === "filled" && c.filled > 0);
  if (filled.length === 0) return "—";
  const totalQty = filled.reduce((s, c) => s + c.filled, 0);
  const totalValue = filled.reduce((s, c) => s + c.limitPrice * c.filled, 0);
  return totalQty > 0 ? (totalValue / totalQty).toFixed(4) : "—";
}

function ChildRows({ rows, asset }: { rows: ChildOrder[]; asset: string }) {
  return (
    <>
      {rows.map((child) => (
        <tr key={child.id} className="border-b border-gray-800/20 bg-gray-900/40">
          <td className="pl-8 pr-3 py-1 text-gray-600 tabular-nums whitespace-nowrap">
            {formatTime(child.submittedAt)}
          </td>
          <td className="px-3 py-1 text-gray-600 font-mono">↳ {child.id.slice(0, 8)}</td>
          <td className="px-3 py-1 text-gray-500">{asset}</td>
          <td
            className={`px-3 py-1 text-xs ${child.side === "BUY" ? "text-emerald-600" : "text-red-600"}`}
          >
            {child.side}
          </td>
          <td className="px-3 py-1 text-right tabular-nums text-gray-500">
            {child.quantity.toFixed(1)}
          </td>
          <td className="px-3 py-1 text-right tabular-nums text-gray-500">
            {formatPrice(asset, child.limitPrice)}
          </td>
          <td className="px-3 py-1 text-gray-600">child</td>
          <td className="px-3 py-1">
            <span
              className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${STATUS_STYLES[child.status]}`}
            >
              {child.status}
            </span>
          </td>
          <td className="px-3 py-1 text-gray-600" />
        </tr>
      ))}
    </>
  );
}

export function OrderBlotter() {
  const orders = useAppSelector((s) => s.orders.orders);
  const expanded = useSignal<Set<string>>(new Set());

  function toggleExpand(id: string) {
    const next = new Set(expanded.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expanded.value = next;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-gray-700 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Order Blotter
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">
            {orders.length} order{orders.length !== 1 ? "s" : ""}
          </span>
          <PopOutButton panelId="order-blotter" />
        </div>
      </div>
      <div className="overflow-auto flex-1">
        {orders.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-gray-600 text-xs">
            No orders submitted yet
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800 sticky top-0 bg-gray-950">
                <th className="text-left px-3 py-2">Time</th>
                <th className="text-left px-3 py-2">ID</th>
                <th className="text-left px-3 py-2">Asset</th>
                <th className="text-left px-3 py-2">Side</th>
                <th className="text-right px-3 py-2">Qty</th>
                <th className="text-right px-3 py-2">Limit</th>
                <th className="text-left px-3 py-2">Strategy</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-right px-3 py-2">Avg Fill</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <>
                  <tr
                    key={order.id}
                    className="border-b border-gray-800/40 hover:bg-gray-800/20 transition-colors"
                  >
                    <td className="px-3 py-1.5 text-gray-500 tabular-nums whitespace-nowrap">
                      {formatTime(order.submittedAt)}
                    </td>
                    <td className="px-3 py-1.5 text-gray-500 font-mono">
                      {order.children.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => toggleExpand(order.id)}
                          className="flex items-center gap-1 hover:text-gray-300 transition-colors"
                        >
                          <span>{expanded.value.has(order.id) ? "▾" : "▸"}</span>
                          {order.id.slice(0, 8)}
                          <span className="text-gray-700 ml-0.5">({order.children.length})</span>
                        </button>
                      ) : (
                        order.id.slice(0, 8)
                      )}
                    </td>
                    <td className="px-3 py-1.5 font-semibold text-gray-200">{order.asset}</td>
                    <td
                      className={`px-3 py-1.5 font-semibold ${order.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}
                    >
                      {order.side}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-200">
                      {order.quantity.toLocaleString()}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-300">
                      {formatPrice(order.asset, order.limitPrice)}
                    </td>
                    <td className="px-3 py-1.5 text-gray-400">{order.strategy}</td>
                    <td className="px-3 py-1.5">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[order.status]}`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                      {order.children.length > 0 ? avgFillPrice(order.children) : "—"}
                    </td>
                  </tr>
                  {expanded.value.has(order.id) && order.children.length > 0 && (
                    <ChildRows
                      key={`${order.id}-children`}
                      rows={order.children}
                      asset={order.asset}
                    />
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

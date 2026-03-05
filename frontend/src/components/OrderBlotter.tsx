import { useSignal } from "@preact/signals-react";
import { Fragment, useEffect } from "react";
import { useChannelContext } from "../contexts/ChannelContext.tsx";
import { useChannelOut } from "../hooks/useChannelOut.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { orderPatched } from "../store/ordersSlice.ts";
import type { ChildOrder, LiquidityFlag, OrderStatus } from "../types.ts";
import type { ContextMenuEntry } from "./ContextMenu.tsx";
import { ContextMenu } from "./ContextMenu.tsx";
import { CHANNEL_COLOURS } from "./DashboardLayout.tsx";
import { PopOutButton } from "./PopOutButton.tsx";

const STATUS_STYLES: Record<OrderStatus, string> = {
  queued: "bg-amber-900/50 text-amber-300 border border-amber-700/50",
  executing: "bg-sky-900/50 text-sky-300 border border-sky-700/50",
  filled: "bg-emerald-900/50 text-emerald-300 border border-emerald-700/50",
  expired: "bg-gray-800/50 text-gray-500 border border-gray-700/50",
  rejected: "bg-red-950/60 text-red-400 border border-red-800/50",
};

const LIQ_STYLES: Record<LiquidityFlag, string> = {
  MAKER: "text-emerald-500",
  TAKER: "text-amber-500",
  CROSS: "text-sky-500",
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
  // Use avgFillPrice if available, else fall back to limitPrice
  const totalQty = filled.reduce((s, c) => s + c.filled, 0);
  const totalValue = filled.reduce((s, c) => s + (c.avgFillPrice ?? c.limitPrice) * c.filled, 0);
  return totalQty > 0 ? (totalValue / totalQty).toFixed(4) : "—";
}

function totalCommission(children: ChildOrder[]): string {
  const total = children.reduce((s, c) => s + (c.commissionUSD ?? 0), 0);
  if (total === 0) return "—";
  return `$${total.toFixed(2)}`;
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
            {formatPrice(asset, child.avgFillPrice ?? child.limitPrice)}
          </td>
          <td className="px-3 py-1 text-gray-600">
            {child.venue ? (
              <span className="text-[9px] font-mono text-gray-500 bg-gray-800 rounded px-1">
                {child.venue}
              </span>
            ) : (
              "child"
            )}
          </td>
          <td className="px-3 py-1">
            <span
              className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${STATUS_STYLES[child.status]}`}
            >
              {child.status}
            </span>
          </td>
          {/* Enriched columns */}
          <td className="px-3 py-1 text-gray-600 font-mono text-[9px]">
            {child.counterparty ?? "—"}
          </td>
          <td
            className={`px-3 py-1 text-[9px] font-semibold ${child.liquidityFlag ? LIQ_STYLES[child.liquidityFlag] : "text-gray-600"}`}
          >
            {child.liquidityFlag ?? "—"}
          </td>
          <td className="px-3 py-1 text-right tabular-nums text-gray-500 text-[9px]">
            {child.commissionUSD !== undefined ? `$${child.commissionUSD.toFixed(2)}` : "—"}
          </td>
          <td className="px-3 py-1 text-gray-600 font-mono text-[9px]">
            {child.settlementDate ?? "—"}
          </td>
        </tr>
      ))}
    </>
  );
}

export function OrderBlotter() {
  const orders = useAppSelector((s) => s.orders.orders);
  const expanded = useSignal<Set<string>>(new Set());
  const selectedOrderId = useSignal<string | null>(null);
  const broadcast = useChannelOut();
  const dispatch = useAppDispatch();
  const ctxMenu = useSignal<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);
  const { outgoing } = useChannelContext();
  const channelColour = outgoing !== null ? (CHANNEL_COLOURS[outgoing]?.hex ?? null) : null;

  // Auto-select the most recent order on first load (once orders arrive)
  useEffect(() => {
    if (selectedOrderId.value === null && orders.length > 0) {
      const latest = orders[orders.length - 1];
      selectedOrderId.value = latest.id;
      broadcast({ selectedOrderId: latest.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders.length, orders, broadcast, selectedOrderId]);

  function selectOrder(id: string) {
    const next = selectedOrderId.value === id ? null : id;
    selectedOrderId.value = next;
    broadcast({ selectedOrderId: next });
  }

  function toggleExpand(id: string) {
    const next = new Set(expanded.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expanded.value = next;
  }

  function openOrderCtxMenu(e: React.MouseEvent, orderId: string) {
    e.preventDefault();
    e.stopPropagation();
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    const isActive = order.status === "queued" || order.status === "executing";
    const items: ContextMenuEntry[] = [
      {
        label: "Select & broadcast",
        icon: "↗",
        onClick: () => selectOrder(order.id),
      },
      {
        label: "View asset in ladder",
        icon: "↗",
        onClick: () => broadcast({ selectedAsset: order.asset }),
      },
      { separator: true },
      {
        label: "Copy order ID",
        icon: "⎘",
        onClick: () => navigator.clipboard.writeText(order.id),
      },
      { separator: true },
      {
        label: "Cancel order",
        icon: "✕",
        danger: true,
        disabled: !isActive,
        title: isActive ? "Mark order as expired/cancelled" : "Order is already complete",
        onClick: () => {
          dispatch(orderPatched({ id: order.id, patch: { status: "expired" } }));
        },
      },
    ];
    ctxMenu.value = { x: e.clientX, y: e.clientY, items };
  }

  return (
    <div className="flex flex-col h-full">
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
      <div className="px-3 py-1.5 border-b border-gray-800 flex items-center gap-2">
        {selectedOrderId.value && channelColour && (
          <span
            className="text-[10px] rounded px-1.5 py-0.5 font-mono tabular-nums shrink-0"
            style={{ color: channelColour, background: `${channelColour}22` }}
            title="Broadcasting selected order to linked panels"
          >
            ↗ {selectedOrderId.value.slice(0, 8)}
          </span>
        )}
        <span className="text-[10px] text-gray-600 ml-auto">
          {orders.length} order{orders.length !== 1 ? "s" : ""}
        </span>
        <PopOutButton panelId="order-blotter" />
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
                <th className="text-left px-3 py-2" title="Time order was submitted">
                  Time
                </th>
                <th
                  className="text-left px-3 py-2"
                  title="Order ID — click ▸ to expand child executions"
                >
                  ID
                </th>
                <th className="text-left px-3 py-2" title="Instrument / ticker symbol">
                  Asset
                </th>
                <th className="text-left px-3 py-2" title="Order direction: BUY or SELL">
                  Side
                </th>
                <th className="text-right px-3 py-2" title="Total order quantity (shares)">
                  Qty
                </th>
                <th
                  className="text-right px-3 py-2"
                  title="Limit price for parent orders; average fill price for algo orders with child executions"
                >
                  Limit/Fill
                </th>
                <th
                  className="text-left px-3 py-2"
                  title="Execution strategy (LIMIT, TWAP, POV, VWAP) or execution venue for child orders"
                >
                  Strat/Venue
                </th>
                <th className="text-left px-3 py-2" title="Order lifecycle status">
                  Status
                </th>
                <th
                  className="text-left px-3 py-2"
                  title="Counterparty that took the other side of the trade"
                >
                  Cpty
                </th>
                <th
                  className="text-left px-3 py-2"
                  title="Liquidity flag: MAKER (passive, added liquidity), TAKER (aggressive, removed liquidity), CROSS (internal match)"
                >
                  Liq
                </th>
                <th className="text-right px-3 py-2" title="Total execution commission in USD">
                  Comm
                </th>
                <th className="text-left px-3 py-2" title="Settlement date (T+2 for equities)">
                  Settle
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <Fragment key={order.id}>
                  <tr
                    onClick={() => selectOrder(order.id)}
                    onContextMenu={(e) => openOrderCtxMenu(e, order.id)}
                    aria-selected={selectedOrderId.value === order.id}
                    title={`${order.side} ${order.quantity.toLocaleString()} ${order.asset} @ ${formatPrice(order.asset, order.limitPrice)} — ${order.status}. Right-click for actions. Click to ${selectedOrderId.value === order.id ? "deselect" : "select and broadcast to linked panels"}`}
                    style={
                      selectedOrderId.value === order.id && channelColour
                        ? {
                            borderLeft: `3px solid ${channelColour}`,
                            background: `${channelColour}18`,
                          }
                        : { borderLeft: "3px solid transparent" }
                    }
                    className={`border-b border-gray-800/40 cursor-pointer transition-colors ${
                      selectedOrderId.value === order.id && !channelColour
                        ? "bg-sky-900/20 border-l-2 border-l-sky-500"
                        : selectedOrderId.value !== order.id
                          ? "hover:bg-gray-800/20"
                          : ""
                    }`}
                  >
                    <td className="px-3 py-1.5 text-gray-500 tabular-nums whitespace-nowrap">
                      {formatTime(order.submittedAt)}
                    </td>
                    <td className="px-3 py-1.5 text-gray-500 font-mono">
                      {order.children.length > 0 ? (
                        <button
                          type="button"
                          aria-expanded={expanded.value.has(order.id)}
                          aria-label={`${expanded.value.has(order.id) ? "Collapse" : "Expand"} ${order.children.length} child executions for order ${order.id.slice(0, 8)}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(order.id);
                          }}
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
                      {order.children.length > 0
                        ? avgFillPrice(order.children)
                        : formatPrice(order.asset, order.limitPrice)}
                    </td>
                    <td className="px-3 py-1.5 text-gray-400">{order.strategy}</td>
                    <td className="px-3 py-1.5">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[order.status]}`}
                      >
                        {order.status}
                      </span>
                    </td>
                    {/* Parent row: show aggregated commission */}
                    <td className="px-3 py-1.5 text-gray-600">—</td>
                    <td className="px-3 py-1.5 text-gray-600">—</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                      {totalCommission(order.children)}
                    </td>
                    <td className="px-3 py-1.5 text-gray-600 font-mono text-[9px]">
                      {order.settlementDate ?? "—"}
                    </td>
                  </tr>
                  {expanded.value.has(order.id) && order.children.length > 0 && (
                    <ChildRows rows={order.children} asset={order.asset} />
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

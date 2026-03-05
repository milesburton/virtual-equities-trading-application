import { useSignal } from "@preact/signals-react";
import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useChannelContext } from "../contexts/ChannelContext.tsx";
import { useChannelIn } from "../hooks/useChannelIn.ts";
import { useAppSelector } from "../store/hooks.ts";
import type { LiquidityFlag, OrderRecord } from "../types.ts";
import { PopOutButton } from "./PopOutButton.tsx";

const LIQ_COLORS: Record<LiquidityFlag, string> = {
  MAKER: "#10b981",
  TAKER: "#f59e0b",
  CROSS: "#38bdf8",
};

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatBps(bps: number) {
  const sign = bps > 0 ? "+" : "";
  return `${sign}${bps.toFixed(1)}bp`;
}

function buildFillTimeline(order: OrderRecord) {
  if (order.children.length === 0) return [];
  const sorted = order.children
    .filter((c) => c.status === "filled" && c.filled > 0)
    .sort((a, b) => a.submittedAt - b.submittedAt);
  if (sorted.length === 0) return [];

  let cumFilled = 0;
  return sorted.map((c) => {
    cumFilled += c.filled;
    return {
      time: formatTime(c.submittedAt),
      cumFilled,
      fillPx: c.avgFillPrice ?? c.limitPrice,
      pct: order.quantity > 0 ? (cumFilled / order.quantity) * 100 : 0,
    };
  });
}

function TradeRow({ order }: { order: OrderRecord }) {
  const expanded = useSignal(false);

  const filledChildren = order.children.filter((c) => c.status === "filled" && c.filled > 0);
  const totalFilledQty = filledChildren.reduce((s, c) => s + c.filled, 0);
  const totalVal = filledChildren.reduce(
    (s, c) => s + (c.avgFillPrice ?? c.limitPrice) * c.filled,
    0
  );
  const avgPx = totalFilledQty > 0 ? totalVal / totalFilledQty : 0;
  const totalComm = filledChildren.reduce((s, c) => s + (c.commissionUSD ?? 0), 0);

  const impactBps =
    totalFilledQty > 0
      ? order.side === "BUY"
        ? ((avgPx - order.limitPrice) / order.limitPrice) * 10_000
        : ((order.limitPrice - avgPx) / order.limitPrice) * 10_000
      : 0;

  const fillPct = order.quantity > 0 ? (order.filled / order.quantity) * 100 : 0;
  const timeline = buildFillTimeline(order);

  const impactColor =
    impactBps > 5 ? "text-red-400" : impactBps < -2 ? "text-emerald-400" : "text-gray-400";
  const commColor = totalComm < 0 ? "text-emerald-400" : "text-amber-400";
  const statusColor =
    order.status === "filled"
      ? "text-emerald-500"
      : order.status === "expired"
        ? "text-gray-500"
        : "text-sky-400";

  // Liquidity mix for this order
  const liqTotals = filledChildren.reduce(
    (acc, c) => {
      if (c.liquidityFlag === "MAKER") acc.maker += c.filled;
      else if (c.liquidityFlag === "TAKER") acc.taker += c.filled;
      else if (c.liquidityFlag === "CROSS") acc.cross += c.filled;
      return acc;
    },
    { maker: 0, taker: 0, cross: 0 }
  );

  return (
    <>
      <tr
        className="border-b border-gray-800/40 cursor-pointer hover:bg-gray-800/20 transition-colors"
        onClick={() => {
          expanded.value = !expanded.value;
        }}
      >
        <td className="px-3 py-1.5 text-gray-500 tabular-nums whitespace-nowrap text-[10px]">
          {formatTime(order.submittedAt)}
        </td>
        <td className="px-3 py-1.5 font-semibold text-gray-200">{order.asset}</td>
        <td
          className={`px-3 py-1.5 font-semibold ${order.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}
        >
          {order.side}
        </td>
        <td className="px-3 py-1.5 text-gray-400">{order.strategy}</td>
        <td className={`px-3 py-1.5 font-semibold ${statusColor}`}>{order.status}</td>
        <td className="px-3 py-1.5 text-right tabular-nums text-gray-300">{fillPct.toFixed(0)}%</td>
        <td className={`px-3 py-1.5 text-right tabular-nums text-[10px] ${impactColor}`}>
          {totalFilledQty > 0 ? formatBps(impactBps) : "—"}
        </td>
        <td className={`px-3 py-1.5 text-right tabular-nums text-[10px] ${commColor}`}>
          {totalFilledQty > 0 ? `$${totalComm.toFixed(2)}` : "—"}
        </td>
        <td className="px-3 py-1.5 text-right tabular-nums text-gray-500 text-[10px]">
          {filledChildren.length}
        </td>
        <td className="px-3 py-1.5 text-gray-600 text-[10px]">{expanded.value ? "▾" : "▸"}</td>
      </tr>

      {expanded.value && (
        <tr>
          <td colSpan={10} className="p-0">
            <div className="bg-gray-900/40 border-b border-gray-800/40 px-4 py-3 flex flex-col gap-3">
              {/* Fill stats */}
              {totalFilledQty > 0 && (
                <div className="flex items-center gap-4 text-[10px]">
                  <span className="text-gray-500">
                    Avg px <span className="text-gray-300 font-mono">{avgPx.toFixed(4)}</span>
                  </span>
                  <span className="text-gray-500">
                    Limit{" "}
                    <span className="text-gray-300 font-mono">{order.limitPrice.toFixed(4)}</span>
                  </span>
                  {liqTotals.maker + liqTotals.taker + liqTotals.cross > 0 && (
                    <div className="flex gap-2">
                      {liqTotals.maker > 0 && (
                        <span style={{ color: LIQ_COLORS.MAKER }}>
                          MAKER {((liqTotals.maker / totalFilledQty) * 100).toFixed(0)}%
                        </span>
                      )}
                      {liqTotals.taker > 0 && (
                        <span style={{ color: LIQ_COLORS.TAKER }}>
                          TAKER {((liqTotals.taker / totalFilledQty) * 100).toFixed(0)}%
                        </span>
                      )}
                      {liqTotals.cross > 0 && (
                        <span style={{ color: LIQ_COLORS.CROSS }}>
                          CROSS {((liqTotals.cross / totalFilledQty) * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Fill chart */}
              {timeline.length >= 2 ? (
                <div>
                  <div className="text-[10px] text-gray-500 mb-1">
                    Fill progression — {order.asset} {order.side} {order.quantity.toLocaleString()}{" "}
                    @ limit {order.limitPrice.toFixed(2)}
                  </div>
                  <ResponsiveContainer width="100%" height={90}>
                    <LineChart data={timeline} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                      <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#6b7280" }} />
                      <YAxis
                        yAxisId="pct"
                        domain={[0, 100]}
                        tick={{ fontSize: 9, fill: "#6b7280" }}
                        unit="%"
                        width={30}
                      />
                      <YAxis
                        yAxisId="px"
                        orientation="right"
                        tick={{ fontSize: 9, fill: "#6b7280" }}
                        width={50}
                        domain={["auto", "auto"]}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#111827",
                          border: "1px solid #374151",
                          fontSize: 10,
                        }}
                        formatter={(v: unknown, name: string) =>
                          name === "pct"
                            ? [`${Number(v).toFixed(1)}%`, "Fill %"]
                            : [Number(v).toFixed(4), "Fill Px"]
                        }
                      />
                      <ReferenceLine
                        yAxisId="pct"
                        y={100}
                        stroke="#10b981"
                        strokeDasharray="4 2"
                        strokeWidth={1}
                      />
                      <Line
                        yAxisId="pct"
                        type="monotone"
                        dataKey="pct"
                        stroke="#38bdf8"
                        strokeWidth={1.5}
                        dot={false}
                        name="pct"
                      />
                      <Line
                        yAxisId="px"
                        type="monotone"
                        dataKey="fillPx"
                        stroke="#f59e0b"
                        strokeWidth={1}
                        dot={false}
                        strokeDasharray="3 2"
                        name="fillPx"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="text-gray-600 text-[10px]">
                  {filledChildren.length === 0
                    ? "No fills recorded"
                    : "Need ≥2 fills to render chart"}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function ExecutionsPanel() {
  const orders = useAppSelector((s) => s.orders.orders);
  const { incoming } = useChannelContext();
  const channelIn = useChannelIn();
  // When wired to a channel: prefer filtering by the broadcast orderId (1:1 with a trade),
  // falling back to asset if only an asset is broadcast.
  // Without a channel link, show all executions.
  const filterOrderId = incoming !== null ? channelIn.selectedOrderId : null;
  const filterAsset = incoming !== null && !filterOrderId ? channelIn.selectedAsset : null;

  const tradeOrders = useMemo(
    () =>
      orders
        .filter((o) => o.children.length > 0 || o.status === "filled" || o.status === "expired")
        .filter((o) => {
          if (filterOrderId) return o.id === filterOrderId;
          if (filterAsset) return o.asset === filterAsset;
          return true;
        })
        .slice()
        .reverse(),
    [orders, filterOrderId, filterAsset]
  );

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="px-2 py-1.5 border-b border-gray-800 flex items-center gap-2 shrink-0">
        {filterOrderId && (
          <span className="text-[10px] text-amber-400 bg-amber-900/30 font-mono px-1.5 py-0.5 rounded">
            {filterOrderId.slice(0, 8)}
          </span>
        )}
        {filterAsset && !filterOrderId && (
          <span className="text-[10px] text-gray-500 font-mono">{filterAsset}</span>
        )}
        {tradeOrders.length > 0 && (
          <span className="text-[10px] text-gray-600 ml-auto">{tradeOrders.length}</span>
        )}
        <PopOutButton panelId="executions" />
      </div>

      <div className="flex-1 overflow-auto">
        {tradeOrders.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-gray-600">
            {filterOrderId
              ? `No executions for order ${filterOrderId.slice(0, 8)}`
              : filterAsset
                ? `No executions for ${filterAsset}`
                : "No executions yet"}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800 sticky top-0 bg-gray-950">
                <th className="text-left px-3 py-2">Time</th>
                <th className="text-left px-3 py-2">Asset</th>
                <th className="text-left px-3 py-2">Side</th>
                <th className="text-left px-3 py-2">Strategy</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-right px-3 py-2">Fill%</th>
                <th className="text-right px-3 py-2">Impact</th>
                <th className="text-right px-3 py-2">Comm</th>
                <th className="text-right px-3 py-2">Slices</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {tradeOrders.map((order) => (
                <TradeRow key={order.id} order={order} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

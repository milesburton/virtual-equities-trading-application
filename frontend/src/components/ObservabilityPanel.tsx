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
import { useAppSelector } from "../store/hooks.ts";
import type { LiquidityFlag, ObsEvent, OrderRecord } from "../types.ts";
import { PopOutButton } from "./PopOutButton.tsx";

type ObsTab = "summary" | "trades" | "events";

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

function buildSummaryStats(orders: OrderRecord[]) {
  const completed = orders.filter((o) => o.status === "filled" || o.status === "expired");
  const filled = completed.filter((o) => o.status === "filled");
  const expired = completed.filter((o) => o.status === "expired");
  const active = orders.filter((o) => o.status === "queued" || o.status === "executing");

  let totalNotional = 0;
  let totalCommission = 0;
  let makerQty = 0;
  let takerQty = 0;
  let crossQty = 0;
  let totalFilledQty = 0;
  const impactBpsValues: number[] = [];

  for (const order of completed) {
    const filledChildren = order.children.filter((c) => c.status === "filled" && c.filled > 0);
    for (const c of filledChildren) {
      const px = c.avgFillPrice ?? c.limitPrice;
      totalNotional += px * c.filled;
      totalCommission += c.commissionUSD ?? 0;
      totalFilledQty += c.filled;
      if (c.liquidityFlag === "MAKER") makerQty += c.filled;
      else if (c.liquidityFlag === "TAKER") takerQty += c.filled;
      else if (c.liquidityFlag === "CROSS") crossQty += c.filled;
    }

    if (filledChildren.length > 0) {
      const totalFQ = filledChildren.reduce((s, c) => s + c.filled, 0);
      const totalVal = filledChildren.reduce(
        (s, c) => s + (c.avgFillPrice ?? c.limitPrice) * c.filled,
        0
      );
      const avgPx = totalVal / totalFQ;
      const impact =
        order.side === "BUY"
          ? ((avgPx - order.limitPrice) / order.limitPrice) * 10_000
          : ((order.limitPrice - avgPx) / order.limitPrice) * 10_000;
      impactBpsValues.push(impact);
    }
  }

  const avgImpactBps =
    impactBpsValues.length > 0
      ? impactBpsValues.reduce((s, v) => s + v, 0) / impactBpsValues.length
      : 0;

  const totalQty = totalFilledQty;

  return {
    totalOrders: orders.length,
    activeCount: active.length,
    filledCount: filled.length,
    expiredCount: expired.length,
    totalNotional,
    totalCommission,
    avgImpactBps,
    makerPct: totalQty > 0 ? (makerQty / totalQty) * 100 : 0,
    takerPct: totalQty > 0 ? (takerQty / totalQty) * 100 : 0,
    crossPct: totalQty > 0 ? (crossQty / totalQty) * 100 : 0,
  };
}

function bucketEvents(events: ObsEvent[], bucketMs = 5_000) {
  if (!events || events.length === 0) return [];
  const reversed = events.slice().reverse();
  const start = reversed[0]?.ts ?? Date.now() - 60_000;
  const buckets: Record<number, { ts: number; fills: number; orders: number }> = {};
  for (const e of reversed) {
    if (!e?.ts) continue;
    const delta = e.ts - start;
    if (delta < 0) continue;
    const key = start + Math.floor(delta / bucketMs) * bucketMs;
    if (!buckets[key]) buckets[key] = { ts: key, fills: 0, orders: 0 };
    if (e.type === "child_created") buckets[key].fills += 1;
    if (e.type === "order_submitted") buckets[key].orders += 1;
  }
  return Object.values(buckets)
    .sort((a, b) => a.ts - b.ts)
    .map((b) => ({ time: formatTime(b.ts), fills: b.fills, orders: b.orders }));
}

function StatBox({
  label,
  value,
  color = "text-gray-200",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="bg-gray-900/50 rounded border border-gray-800/50 px-2 py-1.5">
      <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function LiqBar({
  makerPct,
  takerPct,
  crossPct,
}: {
  makerPct: number;
  takerPct: number;
  crossPct: number;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[9px] text-gray-500 uppercase tracking-wider">Liquidity Mix</div>
      <div className="flex h-2 rounded overflow-hidden w-full bg-gray-800">
        <div
          style={{ width: `${makerPct}%`, background: LIQ_COLORS.MAKER }}
          title={`MAKER ${makerPct.toFixed(0)}%`}
        />
        <div
          style={{ width: `${takerPct}%`, background: LIQ_COLORS.TAKER }}
          title={`TAKER ${takerPct.toFixed(0)}%`}
        />
        <div
          style={{ width: `${crossPct}%`, background: LIQ_COLORS.CROSS }}
          title={`CROSS ${crossPct.toFixed(0)}%`}
        />
      </div>
      <div className="flex gap-2 text-[9px] mt-0.5">
        <span style={{ color: LIQ_COLORS.MAKER }}>MAKER {makerPct.toFixed(0)}%</span>
        <span style={{ color: LIQ_COLORS.TAKER }}>TAKER {takerPct.toFixed(0)}%</span>
        {crossPct > 0 && (
          <span style={{ color: LIQ_COLORS.CROSS }}>CROSS {crossPct.toFixed(0)}%</span>
        )}
      </div>
    </div>
  );
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
            <div className="bg-gray-900/40 border-b border-gray-800/40 px-4 py-2">
              {timeline.length >= 2 ? (
                <>
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
                </>
              ) : (
                <div className="text-gray-600 text-[10px] py-2">
                  {filledChildren.length === 0
                    ? "No fills recorded for this order"
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

export function ObservabilityPanel() {
  const events = useAppSelector((s) => s.observability.events);
  const orders = useAppSelector((s) => s.orders.orders);
  const tab = useSignal<ObsTab>("summary");

  const chartData = useMemo(() => bucketEvents(events, 5_000), [events]);
  const stats = useMemo(() => buildSummaryStats(orders), [orders]);

  const tradeOrders = useMemo(
    () =>
      orders.filter(
        (o) => o.children.length > 0 || o.status === "filled" || o.status === "expired"
      ),
    [orders]
  );

  const latest = useMemo(() => events.slice(0, 100), [events]);

  function replay() {
    const r = events.slice().reverse();
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  }

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="px-3 py-1.5 border-b border-gray-800 flex items-center justify-between gap-2 flex-wrap shrink-0">
        <div className="flex items-center gap-1">
          <div className="flex rounded overflow-hidden border border-gray-700 text-[11px]">
            <button
              type="button"
              onClick={() => {
                tab.value = "summary";
              }}
              title="Summary — overview of fill statistics, notional, commission, and liquidity mix"
              aria-pressed={tab.value === "summary"}
              className={`px-2.5 py-1 transition-colors ${tab.value === "summary" ? "bg-sky-900/60 text-sky-300" : "text-gray-500 hover:text-gray-300"}`}
            >
              Summary
            </button>
            <button
              type="button"
              onClick={() => {
                tab.value = "trades";
              }}
              title="Trades — individual trade records with fill progression charts"
              aria-pressed={tab.value === "trades"}
              className={`px-2.5 py-1 transition-colors ${tab.value === "trades" ? "bg-sky-900/60 text-sky-300" : "text-gray-500 hover:text-gray-300"}`}
            >
              Trades
              {tradeOrders.length > 0 && (
                <span className="ml-1 text-[9px] bg-gray-700 text-gray-400 rounded px-1">
                  {tradeOrders.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                tab.value = "events";
              }}
              title="Events — raw observability event stream from the algo engine"
              aria-pressed={tab.value === "events"}
              className={`px-2.5 py-1 transition-colors ${tab.value === "events" ? "bg-sky-900/60 text-sky-300" : "text-gray-500 hover:text-gray-300"}`}
            >
              Events
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {tab.value === "events" && (
            <button
              type="button"
              onClick={replay}
              title="Export event log as JSON and open in new tab"
              aria-label="Export events as JSON"
              className="text-[11px] text-gray-400 hover:text-gray-200"
            >
              Export
            </button>
          )}
          <PopOutButton panelId="observability" />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {tab.value === "summary" && (
          <div className="p-3 flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-2">
              <StatBox label="Total Orders" value={String(stats.totalOrders)} />
              <StatBox
                label="Active"
                value={String(stats.activeCount)}
                color={stats.activeCount > 0 ? "text-sky-400" : "text-gray-400"}
              />
              <StatBox label="Filled" value={String(stats.filledCount)} color="text-emerald-400" />
              <StatBox
                label="Expired"
                value={String(stats.expiredCount)}
                color={stats.expiredCount > 0 ? "text-gray-400" : "text-gray-600"}
              />
              <StatBox
                label="Total Notional"
                value={
                  stats.totalNotional >= 1_000_000
                    ? `$${(stats.totalNotional / 1_000_000).toFixed(2)}M`
                    : `$${(stats.totalNotional / 1_000).toFixed(1)}K`
                }
              />
              <StatBox
                label="Total Comm"
                value={`$${stats.totalCommission.toFixed(2)}`}
                color={stats.totalCommission < 0 ? "text-emerald-400" : "text-amber-400"}
              />
            </div>

            <div className="bg-gray-900/50 rounded border border-gray-800/50 px-3 py-2 flex items-center justify-between">
              <div>
                <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">
                  Avg Market Impact
                </div>
                <div
                  className={`text-lg font-semibold tabular-nums ${
                    stats.avgImpactBps > 5
                      ? "text-red-400"
                      : stats.avgImpactBps < -2
                        ? "text-emerald-400"
                        : "text-gray-300"
                  }`}
                >
                  {stats.filledCount > 0 ? formatBps(stats.avgImpactBps) : "—"}
                </div>
              </div>
              <div className="text-[9px] text-gray-600 max-w-[100px] text-right">
                Slippage vs arrival price (signed, side-aware)
              </div>
            </div>

            {stats.makerPct + stats.takerPct + stats.crossPct > 0 && (
              <div className="bg-gray-900/50 rounded border border-gray-800/50 px-3 py-2">
                <LiqBar
                  makerPct={stats.makerPct}
                  takerPct={stats.takerPct}
                  crossPct={stats.crossPct}
                />
              </div>
            )}

            {chartData.length > 0 && (
              <div className="bg-gray-900/30 rounded border border-gray-800/50 p-2">
                <div className="text-[10px] text-gray-500 mb-1">Fill events / 5s bucket</div>
                <ResponsiveContainer width="100%" height={80}>
                  <LineChart data={chartData}>
                    <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#6b7280" }} />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 9, fill: "#6b7280" }}
                      width={20}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#111827",
                        border: "1px solid #374151",
                        fontSize: 10,
                      }}
                      formatter={(v: unknown, name: string) => [
                        String(v),
                        name === "fills" ? "Fills" : "Orders",
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="fills"
                      stroke="#10b981"
                      strokeWidth={1.5}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="orders"
                      stroke="#38bdf8"
                      strokeWidth={1}
                      dot={false}
                      strokeDasharray="3 2"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {tab.value === "trades" &&
          (tradeOrders.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-gray-600">No trades yet</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800 sticky top-0 bg-gray-950">
                  <th className="text-left px-3 py-2" title="Time order was submitted">
                    Time
                  </th>
                  <th className="text-left px-3 py-2" title="Instrument / ticker symbol">
                    Asset
                  </th>
                  <th className="text-left px-3 py-2" title="Order direction: BUY or SELL">
                    Side
                  </th>
                  <th
                    className="text-left px-3 py-2"
                    title="Execution strategy (LIMIT, TWAP, POV, VWAP)"
                  >
                    Strategy
                  </th>
                  <th className="text-left px-3 py-2" title="Order lifecycle status">
                    Status
                  </th>
                  <th
                    className="text-right px-3 py-2"
                    title="Percentage of order quantity that has been filled"
                  >
                    Fill%
                  </th>
                  <th
                    className="text-right px-3 py-2"
                    title="Market impact in basis points — slippage of average fill price vs limit price"
                  >
                    Impact
                  </th>
                  <th className="text-right px-3 py-2" title="Total execution commission in USD">
                    Comm
                  </th>
                  <th className="text-right px-3 py-2" title="Number of child execution slices">
                    Slices
                  </th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {tradeOrders.map((order) => (
                  <TradeRow key={order.id} order={order} />
                ))}
              </tbody>
            </table>
          ))}

        {tab.value === "events" && (
          <div className="p-3 flex flex-col gap-2">
            {latest.length === 0 ? (
              <div className="text-gray-600">No events yet</div>
            ) : (
              <ul className="space-y-1.5">
                {latest.map((e) => (
                  <li
                    key={`${e.ts}-${e.type}`}
                    className="p-2 bg-gray-900/40 rounded border border-gray-800/50"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-gray-500 text-[10px]">
                        {e.ts ? formatTime(e.ts) : "—"}
                      </div>
                      <div className="text-[11px] font-mono text-gray-200">{e.type}</div>
                    </div>
                    <pre className="text-[10px] text-gray-500 mt-1 overflow-auto max-h-20 leading-relaxed">
                      {JSON.stringify(e.payload, null, 2)}
                    </pre>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

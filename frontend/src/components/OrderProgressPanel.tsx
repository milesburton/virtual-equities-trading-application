import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAppSelector } from "../store/hooks.ts";
import type { OrderRecord } from "../types.ts";

const FILL_COLOUR = "#34d399";
const REMAINING_COLOUR = "#1f2937";
const STRATEGY_COLOURS: Record<string, string> = {
  LIMIT: "#3b82f6",
  TWAP: "#a855f7",
  POV: "#f97316",
  VWAP: "#eab308",
};

function fillPct(order: OrderRecord): number {
  if (order.quantity === 0) return 0;
  return Math.min(1, order.filled / order.quantity);
}

function shortId(id: string): string {
  return id.slice(0, 6).toUpperCase();
}

interface PieEntry {
  name: string;
  value: number;
  colour: string;
}

interface BarEntry {
  strategy: string;
  avgFill: number;
  count: number;
  colour: string;
}

function buildPieRows(orders: OrderRecord[]): { id: string; pct: number; slices: PieEntry[] }[] {
  return orders
    .filter((o) => o.status === "executing" || o.status === "queued")
    .map((o) => {
      const pct = fillPct(o);
      return {
        id: `${shortId(o.id)} ${o.side} ${o.asset}`,
        pct,
        slices: [
          { name: "Filled", value: Math.round(pct * 100), colour: FILL_COLOUR },
          { name: "Remaining", value: Math.round((1 - pct) * 100), colour: REMAINING_COLOUR },
        ],
      };
    });
}

function buildBarRows(orders: OrderRecord[]): BarEntry[] {
  const byStrategy: Record<string, { total: number; count: number }> = {};
  for (const o of orders) {
    if (o.quantity === 0) continue;
    const s = o.strategy;
    byStrategy[s] ??= { total: 0, count: 0 };
    byStrategy[s].total += fillPct(o) * 100;
    byStrategy[s].count += 1;
  }
  return Object.entries(byStrategy).map(([strategy, { total, count }]) => ({
    strategy,
    avgFill: Math.round(total / count),
    count,
    colour: STRATEGY_COLOURS[strategy] ?? "#6b7280",
  }));
}

interface PieTooltipProps {
  active?: boolean;
  payload?: { name: string; value: number }[];
}

function PieTooltipContent({ active, payload }: PieTooltipProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  if (item.name === "Remaining") return null;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200">
      {item.value}% filled
    </div>
  );
}

interface BarTooltipProps {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}

function BarTooltipContent({ active, payload, label }: BarTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200">
      {label}: {payload[0].value}% avg fill
    </div>
  );
}

export function OrderProgressPanel() {
  const orders = useAppSelector((s) => s.orders.orders);

  const activeOrders = orders.filter((o) => o.status === "executing" || o.status === "queued");
  const allOrders = orders.filter((o) => o.status !== "expired");

  const pieRows = buildPieRows(orders);
  const barRows = buildBarRows(allOrders);

  return (
    <div className="flex flex-col h-full bg-gray-950 overflow-y-auto">
      <div className="px-3 pt-3 pb-2 border-b border-gray-800 shrink-0">
        <span className="text-[11px] text-gray-500 uppercase tracking-wider">
          Fill Progress — {activeOrders.length} active order{activeOrders.length !== 1 ? "s" : ""}
        </span>
      </div>

      {pieRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-2 text-gray-600 text-xs">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="28"
            height="28"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 3" strokeLinecap="round" />
          </svg>
          No active orders
        </div>
      ) : (
        <div className="flex flex-wrap gap-x-4 gap-y-2 px-3 pt-3">
          {pieRows.map((row) => (
            <div key={row.id} className="flex flex-col items-center gap-0.5 w-[72px]">
              <ResponsiveContainer width={64} height={64}>
                <PieChart>
                  <Pie
                    data={row.slices}
                    dataKey="value"
                    innerRadius={18}
                    outerRadius={28}
                    startAngle={90}
                    endAngle={-270}
                    strokeWidth={0}
                  >
                    {row.slices.map((slice) => (
                      <Cell key={slice.name} fill={slice.colour} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltipContent />} />
                </PieChart>
              </ResponsiveContainer>
              <span className="text-[10px] text-emerald-400 tabular-nums font-medium">
                {row.pct === 1 ? "100" : Math.round(row.pct * 100)}%
              </span>
              <span
                className="text-[9px] text-gray-500 text-center leading-tight truncate w-full text-center"
                title={row.id}
              >
                {row.id}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="px-3 pt-4 pb-2 border-t border-gray-800 mt-4 shrink-0">
        <span className="text-[11px] text-gray-500 uppercase tracking-wider">
          Avg Fill by Strategy
        </span>
      </div>

      {barRows.length === 0 ? (
        <div className="flex items-center justify-center flex-1 text-gray-600 text-xs pb-4">
          No orders yet
        </div>
      ) : (
        <div className="px-2 pb-4" style={{ height: 140 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barRows} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
              <XAxis
                dataKey="strategy"
                tick={{ fontSize: 10, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 9, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip content={<BarTooltipContent />} cursor={{ fill: "#ffffff08" }} />
              <Bar dataKey="avgFill" radius={[3, 3, 0, 0]}>
                {barRows.map((row) => (
                  <Cell key={row.strategy} fill={row.colour} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

import { useSignal } from "@preact/signals-react";
import { useMemo } from "react";
import { useChannelIn } from "../hooks/useChannelIn.ts";
import { useAppSelector } from "../store/hooks.ts";
import type { ContextMenuEntry } from "./ContextMenu.tsx";
import { ContextMenu } from "./ContextMenu.tsx";

interface AlgoEvent {
  ts: number;
  topic: string;
  algo?: string;
  asset?: string;
  side?: string;
  event?: string;
  reason?: string;
  qty?: number;
  price?: number;
  filledQty?: number;
  avgFillPrice?: number;
  marketImpactBps?: number;
  sliceIndex?: number;
  numSlices?: number;
  totalFilled?: number;
  totalQty?: number;
  vwap?: number;
  deviation?: number;
  tickVolume?: number;
  participationRate?: number;
  pendingOrders?: number;
  activeOrders?: number;
  orderId?: string;
  parentOrderId?: string;
  childId?: string;
}

const TOPIC_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  "orders.submitted": { label: "Submitted", icon: "📋", color: "text-sky-400" },
  "orders.routed": { label: "Routed", icon: "→", color: "text-sky-500" },
  "orders.child": { label: "Slice", icon: "⚡", color: "text-amber-400" },
  "orders.filled": { label: "Filled", icon: "✓", color: "text-emerald-400" },
  "orders.expired": { label: "Expired", icon: "⏱", color: "text-gray-500" },
  "algo.heartbeat": { label: "Heartbeat", icon: "♡", color: "text-gray-700" },
};

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatPrice(p: number) {
  return p.toFixed(2);
}

function formatQty(n: number) {
  return n % 1 === 0 ? n.toLocaleString() : n.toFixed(1);
}

function eventSummary(topic: string, ev: AlgoEvent): string {
  switch (topic) {
    case "orders.submitted":
      return `${ev.algo ?? ""} ${ev.side ?? ""} ${ev.qty ? formatQty(ev.qty) : ""} ${ev.asset ?? ""} @ ${ev.price ? formatPrice(ev.price) : "mkt"}`;
    case "orders.routed":
      return `→ ${ev.algo ?? ""} engine`;
    case "orders.child": {
      const slice =
        ev.sliceIndex != null && ev.numSlices != null
          ? ` [${ev.sliceIndex + 1}/${ev.numSlices}]`
          : "";
      return `${ev.algo ?? ""}${slice} ${ev.side ?? ""} ${ev.qty ? formatQty(ev.qty) : ""} ${ev.asset ?? ""} @ ${ev.price ? formatPrice(ev.price) : "—"}`;
    }
    case "orders.filled": {
      const impact =
        ev.marketImpactBps != null
          ? ` · impact ${ev.marketImpactBps > 0 ? "+" : ""}${ev.marketImpactBps.toFixed(1)}bp`
          : "";
      const progress =
        ev.totalFilled != null && ev.totalQty != null
          ? ` (${formatQty(ev.totalFilled)}/${formatQty(ev.totalQty)})`
          : "";
      return `${ev.algo ?? ""} filled ${ev.filledQty ? formatQty(ev.filledQty) : ""} ${ev.asset ?? ""}${progress} @ ${ev.avgFillPrice ? formatPrice(ev.avgFillPrice) : "—"}${impact}`;
    }
    case "orders.expired":
      return `${ev.algo ?? ""} expired ${ev.asset ?? ""} — ${ev.filledQty ? formatQty(ev.filledQty) : "0"} filled`;
    case "algo.heartbeat":
      if (ev.event === "start")
        return `${ev.algo ?? ""} started ${ev.asset ?? ""} × ${ev.numSlices ?? ""} slices`;
      if (ev.event === "complete")
        return `${ev.algo ?? ""} complete ${ev.asset ?? ""} — avg ${ev.avgFillPrice ? formatPrice(ev.avgFillPrice) : "—"}`;
      return `${ev.algo ?? ""} alive · ${ev.pendingOrders ?? ev.activeOrders ?? 0} active`;
    default:
      return topic;
  }
}

const ALGO_COLORS: Record<string, string> = {
  LIMIT: "text-gray-400",
  TWAP: "text-sky-400",
  POV: "text-amber-400",
  VWAP: "text-purple-400",
};

export function DecisionLog() {
  const events = useAppSelector((s) => s.observability.events);
  const channelIn = useChannelIn();
  const filterAsset = channelIn.selectedAsset ?? null;

  const showHeartbeats = useSignal(false);
  const algoFilter = useSignal("ALL");
  const ctxMenu = useSignal<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);

  function openEventCtxMenu(e: React.MouseEvent, p: AlgoEvent, eventType: string) {
    e.preventDefault();
    const items: ContextMenuEntry[] = [];
    if (p.asset) {
      items.push({
        label: `Copy symbol: ${p.asset}`,
        icon: "⎘",
        onClick: () => navigator.clipboard.writeText(p.asset ?? ""),
      });
    }
    if (p.algo) {
      items.push({
        label: `Filter by algo: ${p.algo}`,
        icon: "⚡",
        onClick: () => {
          algoFilter.value = p.algo ?? "ALL";
        },
      });
    }
    if (p.orderId || p.parentOrderId) {
      items.push({
        label: "Copy order ID",
        icon: "⎘",
        onClick: () => navigator.clipboard.writeText(p.orderId ?? p.parentOrderId ?? ""),
      });
    }
    items.push({ separator: true });
    items.push({
      label: `Event type: ${eventType}`,
      icon: "ℹ",
      disabled: true,
      onClick: () => {},
    });
    if (items.filter((i) => !("separator" in i)).length > 1) {
      ctxMenu.value = { x: e.clientX, y: e.clientY, items };
    }
  }

  const filtered = useMemo(() => {
    return events
      .filter((e) => {
        const p = e.payload as AlgoEvent | undefined;
        if (!showHeartbeats.value && e.type === "algo.heartbeat") return false;
        if (algoFilter.value !== "ALL" && p?.algo !== algoFilter.value) return false;
        if (filterAsset && p?.asset && p.asset !== filterAsset) return false;
        // Only algo-relevant topics
        if (!TOPIC_LABELS[e.type]) return false;
        return true;
      })
      .slice(0, 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, showHeartbeats.value, algoFilter.value, filterAsset]);

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
      {/* Toolbar */}
      <div className="px-3 py-1.5 border-b border-gray-800 flex items-center gap-2 flex-wrap shrink-0">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
          Decision Log
        </span>
        {filterAsset && (
          <span className="text-[10px] text-sky-400 bg-sky-900/30 rounded px-1.5 py-0.5">
            {filterAsset}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <select
            aria-label="Filter by algo"
            title="Show only events from this algorithm"
            value={algoFilter.value}
            onChange={(e) => {
              algoFilter.value = e.target.value;
            }}
            className="bg-gray-800 text-[10px] text-gray-300 rounded px-1.5 py-0.5 border border-gray-700"
          >
            <option value="ALL">All algos</option>
            <option value="LIMIT">LIMIT</option>
            <option value="TWAP">TWAP</option>
            <option value="POV">POV</option>
            <option value="VWAP">VWAP</option>
          </select>
          <label
            className="flex items-center gap-1 text-[10px] text-gray-500 cursor-pointer select-none"
            title="Show periodic heartbeat events from algo engines"
          >
            <input
              type="checkbox"
              checked={showHeartbeats.value}
              onChange={(e) => {
                showHeartbeats.value = e.target.checked;
              }}
              className="accent-emerald-500 w-3 h-3"
            />
            Heartbeats
          </label>
          <span className="text-[10px] text-gray-600 tabular-nums">{filtered.length} events</span>
        </div>
      </div>

      {/* Event stream */}
      <div className="flex-1 overflow-auto font-mono">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-gray-600 text-xs">
            {events.length === 0 ? "Waiting for algo activity…" : "No events match current filters"}
          </div>
        ) : (
          <table className="w-full text-[10px]">
            <tbody>
              {filtered.map((e, i) => {
                const p = (e.payload ?? {}) as unknown as AlgoEvent;
                const meta = TOPIC_LABELS[e.type];
                const ts = e.ts ?? p.ts ?? 0;
                const isFill = e.type === "orders.filled";
                const isExpired = e.type === "orders.expired";
                const isHeartbeat = e.type === "algo.heartbeat";

                return (
                  <tr
                    key={`${ts}-${e.type}-${p.orderId ?? p.parentOrderId ?? i}`}
                    className={`border-b border-gray-800/30 hover:bg-gray-900/40 transition-colors cursor-context-menu ${
                      isFill ? "bg-emerald-950/10" : isExpired ? "bg-red-950/10" : ""
                    }`}
                    onContextMenu={(ev) => openEventCtxMenu(ev, p, e.type)}
                    title="Right-click for options"
                  >
                    {/* Timestamp */}
                    <td className="pl-3 pr-2 py-1 text-gray-600 whitespace-nowrap w-20 tabular-nums">
                      {ts ? formatTime(ts) : "—"}
                    </td>

                    {/* Topic badge */}
                    <td className="px-2 py-1 w-20 whitespace-nowrap">
                      <span
                        className={`${meta?.color ?? "text-gray-500"} ${isHeartbeat ? "opacity-40" : ""}`}
                        title={e.type}
                      >
                        <span className="mr-1">{meta?.icon ?? "·"}</span>
                        {meta?.label ?? e.type}
                      </span>
                    </td>

                    {/* Algo tag */}
                    <td className="px-2 py-1 w-14 whitespace-nowrap">
                      {p.algo && (
                        <span
                          className={`font-semibold text-[9px] ${ALGO_COLORS[p.algo] ?? "text-gray-400"}`}
                        >
                          {p.algo}
                        </span>
                      )}
                    </td>

                    {/* Summary */}
                    <td className={`px-2 py-1 text-gray-400 ${isHeartbeat ? "opacity-40" : ""}`}>
                      {eventSummary(e.type, p)}
                    </td>

                    {/* Impact badge for fills */}
                    <td className="pr-3 py-1 text-right w-16 whitespace-nowrap">
                      {isFill && p.marketImpactBps != null && (
                        <span
                          className={`text-[9px] font-semibold tabular-nums ${
                            p.marketImpactBps > 5
                              ? "text-red-400"
                              : p.marketImpactBps < -2
                                ? "text-emerald-400"
                                : "text-gray-500"
                          }`}
                        >
                          {p.marketImpactBps > 0 ? "+" : ""}
                          {p.marketImpactBps.toFixed(1)}bp
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

import { useMemo } from "react";
import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAppSelector } from "../store/hooks.ts";
import type { ObsEvent } from "../types.ts";
import { PopOutButton } from "./PopOutButton.tsx";

function bucketEvents(events: ObsEvent[], bucketMs = 5000) {
  if (!events || events.length === 0) return [];
  const now = Date.now();
  const start = Math.max(now - 60_000, events[events.length - 1]?.ts ?? now - 60_000);
  const buckets: Record<number, { ts: number; fills: number; rejects: number }> = {};
  for (const e of events) {
    if (!e?.ts) continue;
    const delta = e.ts - start;
    if (delta < 0) continue;
    const idx = Math.floor(delta / bucketMs);
    const key = start + idx * bucketMs;
    if (!buckets[key]) buckets[key] = { ts: key, fills: 0, rejects: 0 };
    if (String(e.type).includes("fill") || e.type === "child_created") buckets[key].fills += 1;
    if (String(e.type).includes("no_fill") || String(e.type).includes("reject")) buckets[key].rejects += 1;
  }
  return Object.values(buckets)
    .sort((a, b) => a.ts - b.ts)
    .map((b) => ({ time: new Date(b.ts).toLocaleTimeString(), fills: b.fills, rejects: b.rejects }));
}

export function ObservabilityPanel() {
  const events = useAppSelector((s) => s.observability.events);

  const latest = useMemo(() => events.slice(0, 200), [events]);
  const chartData = useMemo(() => bucketEvents(events.slice().reverse(), 5000), [events]);

  function replay() {
    const r = events.slice().reverse();
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  }

  return (
    <div className="p-3 h-full overflow-auto text-xs flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Observability</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={replay} className="text-xs text-gray-400 hover:text-gray-200">Replay</button>
          <PopOutButton panelId="observability" />
        </div>
      </div>

      <div className="h-36 bg-gray-900/30 rounded border border-gray-800/50 p-2">
        <div className="text-[11px] text-gray-400 mb-1">Algo Performance (fills vs rejects)</div>
        <ResponsiveContainer width="100%" height={80}>
          <LineChart data={chartData}>
            <XAxis dataKey="time" tick={{ fontSize: 10 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v: unknown) => [String(v), "count"]} labelFormatter={(l) => `Time: ${l}`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="fills" stroke="#10b981" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="rejects" stroke="#ef4444" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex-1 overflow-auto">
        {latest.length === 0 ? (
          <div className="text-gray-600">No events yet</div>
        ) : (
          <ul className="space-y-2">
            {latest.map((e, i) => (
              <li key={`${e.ts}-${e.type}-${i}`} className="p-2 bg-gray-900/40 rounded border border-gray-800/50">
                <div className="flex items-center justify-between">
                  <div className="text-gray-400 text-[11px]">{e.ts ? new Date(e.ts).toLocaleTimeString() : "—"}</div>
                  <div className="text-xs font-mono text-gray-200">{e.type}</div>
                </div>
                <pre className="text-[11px] text-gray-400 mt-1 overflow-auto max-h-24">{JSON.stringify(e.payload, null, 2)}</pre>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

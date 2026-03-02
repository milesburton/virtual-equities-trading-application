import { useSignal } from "@preact/signals-react";
import { useAppSelector } from "../store/hooks.ts";
import type { ChildOrder } from "../types.ts";
import { PopOutButton } from "./PopOutButton.tsx";

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500 ease-out bg-emerald-500" style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

function formatQty(n: number) {
  return n % 1 === 0 ? n.toLocaleString() : n.toFixed(1);
}

function ChildRows({ rows, asset }: { rows: ChildOrder[]; asset: string }) {
  return (
    <>
      {rows.map((c) => (
        <tr key={c.id} className="bg-gray-900/30">
          <td className="pl-8 pr-3 py-1 text-gray-400 font-mono">{new Date(c.submittedAt).toLocaleTimeString()}</td>
          <td className="px-3 py-1 text-gray-400">{c.side}</td>
          <td className="px-3 py-1 text-gray-400">{asset}</td>
          <td className="px-3 py-1 text-right text-emerald-400">{formatQty(c.filled)}</td>
          <td className="px-3 py-1 text-right text-gray-300">{formatQty(c.quantity)}</td>
          <td className="px-3 py-1 text-gray-400">child</td>
          <td className="px-3 py-1 text-gray-400">{c.status}</td>
        </tr>
      ))}
    </>
  );
}

export function AlgoMonitor() {
  const orders = useAppSelector((s) => s.orders.orders);
  const filter = useSignal("ALL");

  const active = orders.filter(
    (o) => (o.status === "queued" || o.status === "executing") && (filter.value === "ALL" || o.strategy === filter.value)
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Algo Execution Monitor</span>
          <select value={filter.value} onChange={(e) => { filter.value = e.target.value; }} className="bg-gray-800 text-xs text-gray-300 rounded px-2 py-0.5 border border-gray-700">
            <option value="ALL">All</option>
            <option value="LIMIT">Limit</option>
            <option value="TWAP">TWAP</option>
            <option value="POV">POV</option>
            <option value="VWAP">VWAP</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">{active.length} active</span>
          <PopOutButton panelId="algo-monitor" />
        </div>
      </div>
      <div className="overflow-auto flex-1">
        {active.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-gray-600 text-xs">No active algo orders</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800 sticky top-0 bg-gray-950">
                <th className="text-left px-3 py-2">Asset</th>
                <th className="text-left px-3 py-2">Side</th>
                <th className="text-left px-3 py-2">Strategy</th>
                <th className="text-right px-3 py-2">Filled</th>
                <th className="text-right px-3 py-2">Total</th>
                <th className="px-3 py-2 w-32">Progress</th>
                <th className="text-left px-3 py-2">State</th>
              </tr>
            </thead>
            <tbody>
              {active.map((order) => {
                const pct = order.quantity > 0 ? (order.filled / order.quantity) * 100 : 0;
                const secsLeft = Math.max(0, Math.round((order.expiresAt - Date.now()) / 1_000));
                return (
                  <>
                    <tr key={order.id} className="border-b border-gray-800/40 hover:bg-gray-800/20 transition-colors">
                      <td className="px-3 py-2 font-semibold text-gray-200">{order.asset}</td>
                      <td className={`px-3 py-2 font-semibold ${order.side === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{order.side}</td>
                      <td className="px-3 py-2 text-gray-400">{order.strategy}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-400">{formatQty(order.filled)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-300">{formatQty(order.quantity)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <ProgressBar pct={pct} />
                          <span className="text-gray-500 tabular-nums w-10 text-right shrink-0">{pct.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {order.status === "queued" ? (
                          <span className="text-amber-400">Waiting</span>
                        ) : (
                          <span className="text-sky-400">{order.strategy === "LIMIT" ? "Monitoring" : `${secsLeft}s left`}</span>
                        )}
                      </td>
                    </tr>
                    {order.children.length > 0 && (
                      <tr>
                        <td colSpan={7} className="p-0">
                          <table className="w-full text-xs">
                            <tbody><ChildRows rows={order.children} asset={order.asset} /></tbody>
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

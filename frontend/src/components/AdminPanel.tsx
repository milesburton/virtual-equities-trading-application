import { useEffect, useState } from "react";
import { useAppSelector } from "../store/hooks.ts";

interface TradingLimits {
  userId: string;
  max_order_qty: number;
  max_daily_notional: number;
  allowed_strategies: string[];
}

interface UserRow {
  id: string;
  name: string;
  role: string;
  avatar_emoji: string;
}

interface JournalEntry {
  id: number;
  event_type: string;
  ts: number;
  algo: string | null;
  instrument: string | null;
  side: string | null;
  order_id: string | null;
  quantity: number | null;
  limit_price: number | null;
  fill_price: number | null;
  filled_qty: number | null;
  market_price: number | null;
}

const ALL_STRATEGIES = ["LIMIT", "TWAP", "POV", "VWAP"];

export function AdminPanel() {
  const currentUser = useAppSelector((s) => s.auth.user);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [limits, setLimits] = useState<Record<string, TradingLimits>>({});
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/user-service/users", { credentials: "include" })
      .then((r) => r.json())
      .then((data: UserRow[]) => {
        setUsers(data);
        // fetch limits for each user
        for (const u of data) {
          fetch(`/api/user-service/users/${u.id}/limits`, { credentials: "include" })
            .then((r) => r.json())
            .then((lim: TradingLimits) => {
              setLimits((prev) => ({ ...prev, [u.id]: lim }));
            })
            .catch(() => {});
        }
      })
      .catch(() => {});

    fetch("/api/journal/journal?limit=50", { credentials: "include" })
      .then((r) => r.json())
      .then((data: { entries: JournalEntry[] }) => setJournal(data.entries ?? []))
      .catch(() => {});
  }, []);

  async function saveLimits(userId: string) {
    const lim = limits[userId];
    if (!lim) return;
    setSaving(userId);
    setSaveError(null);
    try {
      const res = await fetch(`/api/user-service/users/${userId}/limits`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          max_order_qty: lim.max_order_qty,
          max_daily_notional: lim.max_daily_notional,
          allowed_strategies: lim.allowed_strategies,
        }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(null);
    }
  }

  function toggleStrategy(userId: string, strategy: string) {
    setLimits((prev) => {
      const lim = prev[userId];
      if (!lim) return prev;
      const current = lim.allowed_strategies;
      const updated = current.includes(strategy)
        ? current.filter((s) => s !== strategy)
        : [...current, strategy];
      return { ...prev, [userId]: { ...lim, allowed_strategies: updated } };
    });
  }

  const isAdmin = currentUser?.role === "admin";

  return (
    <div className="h-full overflow-auto p-3 space-y-4 text-xs">
      {/* Trading Limits table */}
      <div>
        <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Trading Limits
          {!isAdmin && (
            <span className="ml-2 text-orange-400">
              (read-only — mission control access required to edit)
            </span>
          )}
        </div>
        <div className="border border-gray-800 rounded overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-900 text-gray-500 text-[10px] uppercase tracking-wider">
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Max Order Qty</th>
                <th className="px-3 py-2">Max Daily Notional</th>
                <th className="px-3 py-2">Allowed Strategies</th>
                {isAdmin && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {users
                .filter((u) => u.role !== "admin")
                .map((user, idx) => {
                  const lim = limits[user.id];
                  return (
                    <tr
                      key={user.id}
                      className={`border-t border-gray-800 ${idx % 2 === 0 ? "bg-gray-950" : "bg-gray-900/40"}`}
                    >
                      <td className="px-3 py-2">
                        <span className="mr-1">{user.avatar_emoji}</span>
                        <span className="text-gray-200">{user.name}</span>
                        <span
                          className={`ml-1.5 text-[9px] px-1 py-0.5 rounded ${
                            user.role === "admin"
                              ? "bg-orange-900/50 text-orange-400"
                              : "bg-blue-900/50 text-blue-400"
                          }`}
                        >
                          {user.role}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {lim ? (
                          <input
                            type="number"
                            value={lim.max_order_qty}
                            disabled={!isAdmin}
                            onChange={(e) =>
                              setLimits((prev) => ({
                                ...prev,
                                [user.id]: { ...lim, max_order_qty: Number(e.target.value) },
                              }))
                            }
                            className="w-24 bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {lim ? (
                          <input
                            type="number"
                            value={lim.max_daily_notional}
                            disabled={!isAdmin}
                            onChange={(e) =>
                              setLimits((prev) => ({
                                ...prev,
                                [user.id]: { ...lim, max_daily_notional: Number(e.target.value) },
                              }))
                            }
                            className="w-28 bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {lim ? (
                          <div className="flex gap-1">
                            {ALL_STRATEGIES.map((s) => {
                              const enabled = lim.allowed_strategies.includes(s);
                              return (
                                <button
                                  key={s}
                                  type="button"
                                  disabled={!isAdmin}
                                  onClick={() => toggleStrategy(user.id, s)}
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors disabled:cursor-not-allowed ${
                                    enabled
                                      ? "bg-emerald-900/50 text-emerald-400 hover:bg-emerald-900"
                                      : "bg-gray-800 text-gray-600 hover:bg-gray-700"
                                  }`}
                                >
                                  {s}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            disabled={saving === user.id || !lim}
                            onClick={() => saveLimits(user.id)}
                            className="px-2 py-0.5 bg-emerald-800/60 text-emerald-400 hover:bg-emerald-800 rounded text-[10px] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {saving === user.id ? "Saving…" : "Save"}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        {saveError && <div className="mt-1 text-red-400 text-[10px]">{saveError}</div>}
      </div>

      {/* Journal (last 50 entries) */}
      <div>
        <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Recent Audit Journal (last 50)
        </div>
        <div className="border border-gray-800 rounded overflow-hidden">
          <table className="w-full text-left text-[10px]">
            <thead>
              <tr className="bg-gray-900 text-gray-500 uppercase tracking-wider">
                <th className="px-3 py-1.5">Time</th>
                <th className="px-3 py-1.5">Event</th>
                <th className="px-3 py-1.5">Algo</th>
                <th className="px-3 py-1.5">Instrument</th>
                <th className="px-3 py-1.5">Side</th>
                <th className="px-3 py-1.5">Qty</th>
                <th className="px-3 py-1.5">Limit Px</th>
                <th className="px-3 py-1.5">Fill Px</th>
                <th className="px-3 py-1.5">Filled</th>
              </tr>
            </thead>
            <tbody>
              {journal.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-4 text-center text-gray-600">
                    No journal entries yet
                  </td>
                </tr>
              ) : (
                journal.map((entry, idx) => (
                  <tr
                    key={entry.id}
                    className={`border-t border-gray-800 ${idx % 2 === 0 ? "bg-gray-950" : "bg-gray-900/40"}`}
                  >
                    <td className="px-3 py-1.5 text-gray-500 tabular-nums whitespace-nowrap">
                      {new Date(entry.ts).toLocaleTimeString()}
                    </td>
                    <td className="px-3 py-1.5">
                      <span
                        className={`px-1 py-0.5 rounded text-[9px] font-medium ${
                          entry.event_type === "orders.filled"
                            ? "bg-emerald-900/50 text-emerald-400"
                            : entry.event_type === "orders.expired"
                              ? "bg-red-900/50 text-red-400"
                              : entry.event_type === "orders.submitted"
                                ? "bg-blue-900/50 text-blue-400"
                                : "bg-gray-800 text-gray-400"
                        }`}
                      >
                        {entry.event_type.replace("orders.", "")}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-gray-400">{entry.algo ?? "—"}</td>
                    <td className="px-3 py-1.5 text-gray-200 font-mono">
                      {entry.instrument ?? "—"}
                    </td>
                    <td
                      className={`px-3 py-1.5 font-medium ${
                        entry.side === "BUY"
                          ? "text-emerald-400"
                          : entry.side === "SELL"
                            ? "text-red-400"
                            : "text-gray-500"
                      }`}
                    >
                      {entry.side ?? "—"}
                    </td>
                    <td className="px-3 py-1.5 text-gray-300 tabular-nums">
                      {entry.quantity?.toLocaleString() ?? "—"}
                    </td>
                    <td className="px-3 py-1.5 text-gray-300 tabular-nums">
                      {entry.limit_price != null ? entry.limit_price.toFixed(4) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-gray-300 tabular-nums">
                      {entry.fill_price != null ? entry.fill_price.toFixed(4) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-gray-300 tabular-nums">
                      {entry.filled_qty?.toLocaleString() ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";

interface NewsSource {
  id: string;
  label: string;
  enabled: boolean;
  symbolSpecific: boolean;
}

const NEWS_AGGREGATOR_URL =
  (import.meta.env?.VITE_NEWS_AGGREGATOR_URL as string | undefined) ?? "/api/news-aggregator";

export function NewsSourcesPanel() {
  const [sources, setSources] = useState<NewsSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSources = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${NEWS_AGGREGATOR_URL}/sources`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSources(await res.json());
    } catch (e) {
      setError((e as Error).message ?? "Could not reach news-aggregator service");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const toggle = useCallback(async (id: string) => {
    setToggling(id);
    try {
      const res = await fetch(`${NEWS_AGGREGATOR_URL}/sources/${id}/toggle`, {
        method: "POST",
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated: NewsSource = await res.json();
      setSources((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch (e) {
      setError((e as Error).message ?? "Toggle failed");
    } finally {
      setToggling(null);
    }
  }, []);

  return (
    <div className="flex flex-col h-full bg-gray-950 text-gray-300">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-800 shrink-0">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          News Sources
        </span>
        <div className="ml-auto">
          <button
            type="button"
            onClick={fetchSources}
            disabled={loading}
            title="Refresh news source list"
            aria-label="Refresh news sources"
            className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-40 px-1 py-0.5 rounded border border-gray-700 hover:border-gray-500"
          >
            ↺
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <span className="text-[11px] text-gray-600">Loading sources…</span>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center gap-2 h-full px-4 text-center">
            <span className="text-[11px] text-red-400/70">{error}</span>
            <button
              type="button"
              onClick={fetchSources}
              title="Retry loading news sources"
              className="text-[10px] text-gray-500 hover:text-gray-300 border border-gray-700 hover:border-gray-500 px-2 py-0.5 rounded transition-colors mt-1"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && sources.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] text-gray-600 mb-3">
              Enable or disable news feed sources. Changes take effect on the next poll cycle.
            </p>
            {sources.map((source) => (
              <div
                key={source.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-900/60 border border-gray-800"
              >
                {/* Status indicator */}
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    source.enabled ? "bg-emerald-400" : "bg-gray-600"
                  }`}
                />

                {/* Source info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium text-gray-200">{source.label}</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-mono border ${
                        source.symbolSpecific
                          ? "text-blue-400 border-blue-700/40 bg-blue-900/20"
                          : "text-gray-500 border-gray-700/40 bg-gray-800/40"
                      }`}
                    >
                      {source.symbolSpecific ? "symbol-specific" : "general"}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] ${
                      source.enabled ? "text-emerald-500" : "text-gray-600"
                    }`}
                  >
                    {source.enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>

                {/* Toggle button */}
                <button
                  type="button"
                  onClick={() => toggle(source.id)}
                  disabled={toggling === source.id}
                  title={source.enabled ? `Disable ${source.label}` : `Enable ${source.label}`}
                  aria-pressed={source.enabled}
                  className={`shrink-0 text-[10px] px-2.5 py-1 rounded border transition-colors disabled:opacity-40 ${
                    source.enabled
                      ? "text-red-400 border-red-700/50 hover:bg-red-900/20 hover:border-red-600"
                      : "text-emerald-400 border-emerald-700/50 hover:bg-emerald-900/20 hover:border-emerald-600"
                  }`}
                >
                  {toggling === source.id ? "…" : source.enabled ? "Disable" : "Enable"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

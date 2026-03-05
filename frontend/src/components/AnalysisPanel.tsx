import { useCallback, useState } from "react";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import type { NewsItem } from "../store/newsSlice.ts";
import { newsBatchReceived, selectNewsForSymbol } from "../store/newsSlice.ts";

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const SENTIMENT_STYLES: Record<NewsItem["sentiment"], { dot: string; badge: string }> = {
  positive: { dot: "bg-emerald-400", badge: "text-emerald-400" },
  negative: { dot: "bg-red-400", badge: "text-red-400" },
  neutral: { dot: "bg-gray-500", badge: "text-gray-500" },
};

const SENTIMENT_LABELS: Record<NewsItem["sentiment"], string> = {
  positive: "▲",
  negative: "▼",
  neutral: "—",
};

const NEWS_AGGREGATOR_URL =
  (import.meta.env?.VITE_NEWS_AGGREGATOR_URL as string | undefined) ?? "/api/news-aggregator";

export function AnalysisPanel() {
  const dispatch = useAppDispatch();
  const selectedAsset = useAppSelector((s) => s.ui.selectedAsset);
  const items = useAppSelector((s) => selectNewsForSymbol(s, selectedAsset));
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(0);

  const refresh = useCallback(async () => {
    if (!selectedAsset) return;
    setRefreshing(true);
    try {
      const res = await fetch(
        `${NEWS_AGGREGATOR_URL}/news?symbol=${encodeURIComponent(selectedAsset)}&limit=50`,
        { signal: AbortSignal.timeout(10_000) }
      );
      if (res.ok) {
        const data: NewsItem[] = await res.json();
        if (data.length > 0) dispatch(newsBatchReceived(data));
      }
    } catch {
      // service unavailable — live bus updates will still arrive
    } finally {
      setRefreshing(false);
      setLastRefresh(Date.now());
    }
  }, [selectedAsset, dispatch]);

  const sentimentCounts = {
    positive: items.filter((i) => i.sentiment === "positive").length,
    negative: items.filter((i) => i.sentiment === "negative").length,
    neutral: items.filter((i) => i.sentiment === "neutral").length,
  };

  return (
    <div className="flex flex-col h-full bg-gray-950 text-gray-300">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-800 shrink-0">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">News</span>

        {/* Selected symbol pill */}
        {selectedAsset && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300 border border-blue-700/40">
            {selectedAsset}
          </span>
        )}

        {/* Sentiment summary */}
        {items.length > 0 && (
          <div className="flex items-center gap-2 ml-1">
            <span className="text-[10px] text-emerald-400">▲ {sentimentCounts.positive}</span>
            <span className="text-[10px] text-red-400">▼ {sentimentCounts.negative}</span>
            <span className="text-[10px] text-gray-600">— {sentimentCounts.neutral}</span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {lastRefresh > 0 && (
            <span className="text-[10px] text-gray-600 tabular-nums">
              {relativeTime(lastRefresh)}
            </span>
          )}
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing || !selectedAsset}
            className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-40 px-1 py-0.5 rounded border border-gray-700 hover:border-gray-500"
          >
            ↺
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {!selectedAsset && (
          <div className="flex items-center justify-center h-full">
            <span className="text-[11px] text-gray-600">Select an asset to see news</span>
          </div>
        )}

        {selectedAsset && items.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 h-full">
            <span className="text-[11px] text-gray-600">No news for {selectedAsset} yet</span>
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="text-[10px] text-gray-500 hover:text-gray-300 border border-gray-700 hover:border-gray-500 px-2 py-0.5 rounded transition-colors disabled:opacity-40"
            >
              {refreshing ? "Loading…" : "Fetch now"}
            </button>
          </div>
        )}

        {selectedAsset && items.length > 0 && (
          <ul className="divide-y divide-gray-800/60">
            {items.map((item) => {
              const s = SENTIMENT_STYLES[item.sentiment];
              return (
                <li key={item.id} className="px-3 py-2.5 hover:bg-gray-900/50 transition-colors">
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`}
                      title={item.sentiment}
                    />
                    <div className="flex-1 min-w-0">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-[12px] leading-snug text-gray-200 hover:text-white transition-colors line-clamp-2"
                      >
                        {item.headline}
                      </a>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[10px] text-gray-600">{item.source}</span>
                        <span className="text-[10px] text-gray-700">·</span>
                        <span className="text-[10px] text-gray-600 tabular-nums">
                          {relativeTime(item.publishedAt)}
                        </span>
                        {item.relatedSymbols.length > 0 && (
                          <>
                            <span className="text-[10px] text-gray-700">·</span>
                            <div className="flex gap-1 flex-wrap">
                              {item.relatedSymbols.map((ticker) => (
                                <span
                                  key={ticker}
                                  className="text-[9px] font-mono px-1 py-0 rounded bg-gray-800 text-gray-500 border border-gray-700/50"
                                >
                                  {ticker}
                                </span>
                              ))}
                            </div>
                          </>
                        )}
                        <span className={`ml-auto text-[10px] font-medium ${s.badge}`}>
                          {SENTIMENT_LABELS[item.sentiment]}
                        </span>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

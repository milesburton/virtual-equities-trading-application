import { useCallback, useEffect, useRef, useState } from "react";

interface NewsItem {
  id: string;
  headline: string;
  source: string;
  url: string;
  publishedAt: number; // ms epoch
  sentiment: "positive" | "negative" | "neutral";
  related: string[]; // ticker symbols if parseable
}

// Free RSS-to-JSON proxy — no API key required
const RSS_FEEDS = [
  {
    label: "Reuters Markets",
    url: "https://feeds.reuters.com/reuters/businessNews",
  },
  {
    label: "Yahoo Finance",
    url: "https://finance.yahoo.com/news/rssindex",
  },
];

const RSS2JSON = "https://api.rss2json.com/v1/api.json?rss_url=";

// Rough sentiment from headline keywords
function scoreSentiment(text: string): "positive" | "negative" | "neutral" {
  const lower = text.toLowerCase();
  const positive = [
    "surge",
    "rally",
    "gain",
    "rise",
    "beat",
    "record",
    "profit",
    "growth",
    "jump",
    "soar",
    "boost",
    "strong",
    "upgrade",
    "bullish",
    "up",
  ];
  const negative = [
    "fall",
    "drop",
    "decline",
    "loss",
    "miss",
    "cut",
    "slump",
    "crash",
    "plunge",
    "warn",
    "fear",
    "risk",
    "bearish",
    "down",
    "sell-off",
  ];
  let score = 0;
  for (const w of positive) if (lower.includes(w)) score++;
  for (const w of negative) if (lower.includes(w)) score--;
  if (score > 0) return "positive";
  if (score < 0) return "negative";
  return "neutral";
}

// Extract ticker-like uppercase words e.g. AAPL, MSFT
function extractTickers(text: string): string[] {
  const matches = text.match(/\b[A-Z]{2,5}\b/g) ?? [];
  // Filter common non-ticker uppercase words
  const ignore = new Set([
    "CEO",
    "CFO",
    "IPO",
    "ETF",
    "GDP",
    "USD",
    "EUR",
    "UK",
    "US",
    "EU",
    "AI",
    "IT",
    "FY",
    "Q1",
    "Q2",
    "Q3",
    "Q4",
  ]);
  return [...new Set(matches.filter((m) => !ignore.has(m)))].slice(0, 4);
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

async function fetchFeed(feedUrl: string, label: string): Promise<NewsItem[]> {
  const res = await fetch(`${RSS2JSON}${encodeURIComponent(feedUrl)}&count=15`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const data = await res.json();
  if (data.status !== "ok" || !Array.isArray(data.items)) return [];
  return data.items.map(
    (item: { title?: string; link?: string; pubDate?: string; guid?: string }) => {
      const headline = item.title ?? "";
      const publishedAt = item.pubDate ? new Date(item.pubDate).getTime() : Date.now();
      return {
        id: item.guid ?? item.link ?? headline,
        headline,
        source: label,
        url: item.link ?? "",
        publishedAt,
        sentiment: scoreSentiment(headline),
        related: extractTickers(headline),
      } satisfies NewsItem;
    }
  );
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

export function AnalysisPanel() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const results = await Promise.allSettled(RSS_FEEDS.map((f) => fetchFeed(f.url, f.label)));
      const all: NewsItem[] = [];
      for (const r of results) {
        if (r.status === "fulfilled") all.push(...r.value);
      }
      if (all.length === 0) {
        setError("No news available — check network or try again");
      } else {
        all.sort((a, b) => b.publishedAt - a.publishedAt);
        setItems(all);
      }
    } catch {
      setError("Failed to load news feeds");
    } finally {
      setLoading(false);
      setLastRefresh(Date.now());
    }
  }, []);

  useEffect(() => {
    refresh();
    // Refresh every 5 minutes
    intervalRef.current = setInterval(refresh, 5 * 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh]);

  const sentimentCounts = {
    positive: items.filter((i) => i.sentiment === "positive").length,
    negative: items.filter((i) => i.sentiment === "negative").length,
    neutral: items.filter((i) => i.sentiment === "neutral").length,
  };

  return (
    <div className="flex flex-col h-full bg-gray-950 text-gray-300">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-gray-800 shrink-0">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Market News
        </span>
        {!loading && items.length > 0 && (
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
            disabled={loading}
            className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-40 px-1 py-0.5 rounded border border-gray-700 hover:border-gray-500"
          >
            ↺
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 h-full">
            <svg
              aria-label="Loading"
              className="animate-spin w-5 h-5 text-emerald-500/60"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span className="text-[11px] text-gray-600">Fetching news feeds…</span>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center gap-2 h-full px-4 text-center">
            <span className="text-[11px] text-red-400/70">{error}</span>
            <button
              type="button"
              onClick={refresh}
              className="text-[10px] text-gray-500 hover:text-gray-300 border border-gray-700 hover:border-gray-500 px-2 py-0.5 rounded transition-colors mt-1"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <ul className="divide-y divide-gray-800/60">
            {items.map((item) => {
              const s = SENTIMENT_STYLES[item.sentiment];
              return (
                <li key={item.id} className="px-3 py-2.5 hover:bg-gray-900/50 transition-colors">
                  <div className="flex items-start gap-2">
                    {/* Sentiment dot */}
                    <span
                      className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`}
                      title={item.sentiment}
                    />
                    <div className="flex-1 min-w-0">
                      {/* Headline */}
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-[12px] leading-snug text-gray-200 hover:text-white transition-colors line-clamp-2"
                      >
                        {item.headline}
                      </a>
                      {/* Meta row */}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[10px] text-gray-600">{item.source}</span>
                        <span className="text-[10px] text-gray-700">·</span>
                        <span className="text-[10px] text-gray-600 tabular-nums">
                          {relativeTime(item.publishedAt)}
                        </span>
                        {item.related.length > 0 && (
                          <>
                            <span className="text-[10px] text-gray-700">·</span>
                            <div className="flex gap-1 flex-wrap">
                              {item.related.map((ticker) => (
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

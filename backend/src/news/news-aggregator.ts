/**
 * News Aggregator Service
 *
 * Polls RSS feeds for symbol-specific news, scores sentiment, and publishes:
 *   news.feed   → gateway → GUI (NewsItem per headline)
 *   news.signal → algos (sentiment signal per symbol)
 *
 * HTTP API:
 *   GET  /health
 *   GET  /news?symbol=AAPL&limit=20
 *   GET  /sources
 *   POST /sources/:id/enable
 *   POST /sources/:id/disable
 *   POST /sources/:id/toggle
 */

import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { createProducer } from "../lib/messaging.ts";

const PORT = Number(Deno.env.get("NEWS_AGGREGATOR_PORT")) || 5_013;
const MARKET_SIM_URL = Deno.env.get("MARKET_SIM_URL") || "http://localhost:5000";
const POLL_INTERVAL_MS = Number(Deno.env.get("NEWS_POLL_INTERVAL_MS")) || 120_000;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";
const MAX_ITEMS_PER_SYMBOL = 100;

console.log(`[news-aggregator] Starting, poll=${POLL_INTERVAL_MS}ms`);

// ── News sources ──────────────────────────────────────────────────────────────

interface NewsSource {
  id: string;
  label: string;
  rssTemplate: string;
  enabled: boolean;
  symbolSpecific: boolean;
}

const SOURCES: NewsSource[] = [
  {
    id: "yahoo-finance",
    label: "Yahoo Finance",
    rssTemplate:
      "https://feeds.finance.yahoo.com/rss/2.0/headline?s={symbol}&region=US&lang=en-US",
    enabled: true,
    symbolSpecific: true,
  },
  {
    id: "marketwatch",
    label: "MarketWatch",
    rssTemplate: "https://feeds.marketwatch.com/marketwatch/topstories/",
    enabled: true,
    symbolSpecific: false,
  },
  {
    id: "investing-com",
    label: "Investing.com",
    rssTemplate: "https://www.investing.com/rss/news.rss",
    enabled: true,
    symbolSpecific: false,
  },
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NewsItem {
  id: string;
  symbol: string;
  headline: string;
  source: string;
  url: string;
  publishedAt: number;
  sentiment: "positive" | "negative" | "neutral";
  sentimentScore: number;
  relatedSymbols: string[];
}

// ── Sentiment + ticker extraction ─────────────────────────────────────────────

const POSITIVE_WORDS = [
  "surge", "rally", "gain", "rise", "beat", "record", "profit", "growth",
  "jump", "soar", "boost", "strong", "upgrade", "bullish", "up", "high",
  "outperform", "exceed", "positive", "optimistic", "buy",
];
const NEGATIVE_WORDS = [
  "fall", "drop", "decline", "loss", "miss", "cut", "slump", "crash",
  "plunge", "warn", "fear", "risk", "bearish", "down", "low", "downgrade",
  "underperform", "negative", "pessimistic", "sell", "sell-off",
];
const IGNORE_TICKERS = new Set([
  "CEO", "CFO", "COO", "CTO", "IPO", "ETF", "GDP", "USD", "EUR", "GBP",
  "UK", "US", "EU", "AI", "IT", "FY", "Q1", "Q2", "Q3", "Q4", "SEC",
  "FED", "ECB", "IMF", "WTI", "LNG", "EPS", "PE", "PB", "ROE", "YTD",
  "QOQ", "YOY", "MOM", "EST", "EDT", "PST",
]);

function scoreSentiment(text: string): { sentiment: "positive" | "negative" | "neutral"; score: number } {
  const lower = text.toLowerCase();
  let score = 0;
  for (const w of POSITIVE_WORDS) if (lower.includes(w)) score++;
  for (const w of NEGATIVE_WORDS) if (lower.includes(w)) score--;
  const sentiment = score > 0 ? "positive" : score < 0 ? "negative" : "neutral";
  return { sentiment, score };
}

function extractTickers(text: string): string[] {
  const matches = text.match(/\b[A-Z]{2,5}\b/g) ?? [];
  return [...new Set(matches.filter((m) => !IGNORE_TICKERS.has(m)))].slice(0, 5);
}

// ── In-memory store ───────────────────────────────────────────────────────────

const newsBySymbol = new Map<string, NewsItem[]>(); // symbol → items (newest first)
const seenIds = new Set<string>(); // dedup by item id
let knownSymbols: string[] = [];

function storeItem(item: NewsItem): void {
  const list = newsBySymbol.get(item.symbol) ?? [];
  list.unshift(item);
  if (list.length > MAX_ITEMS_PER_SYMBOL) list.length = MAX_ITEMS_PER_SYMBOL;
  newsBySymbol.set(item.symbol, list);
}

function totalItems(): number {
  let n = 0;
  for (const v of newsBySymbol.values()) n += v.length;
  return n;
}

// ── RSS fetching ──────────────────────────────────────────────────────────────

interface RssItem {
  title?: string;
  link?: string;
  pubDate?: string;
  guid?: string;
  description?: string;
}

async function fetchRss(url: string): Promise<RssItem[]> {
  try {
    const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { status: string; items?: RssItem[] };
    if (data.status !== "ok" || !Array.isArray(data.items)) return [];
    return data.items;
  } catch {
    return [];
  }
}

// ── Produce to bus ────────────────────────────────────────────────────────────

const producer = await createProducer("news-aggregator").catch((err) => {
  console.warn("[news-aggregator] Redpanda unavailable:", err.message);
  return null;
});

async function publishItem(item: NewsItem): Promise<void> {
  if (!producer) return;
  await producer.send("news.feed", item).catch(() => {});
  // Also publish a signal for algos
  await producer.send("news.signal", {
    symbol: item.symbol,
    sentiment: item.sentiment,
    score: item.sentimentScore,
    headline: item.headline,
    source: item.source,
    ts: item.publishedAt,
  }).catch(() => {});
}

// ── Polling ───────────────────────────────────────────────────────────────────

async function pollSourceForSymbol(source: NewsSource, symbol: string): Promise<void> {
  const url = source.symbolSpecific
    ? source.rssTemplate.replace("{symbol}", encodeURIComponent(symbol))
    : source.rssTemplate;

  const items = await fetchRss(url);
  let newCount = 0;

  for (const raw of items) {
    const headline = raw.title ?? "";
    if (!headline) continue;

    // For general feeds, only process items that mention this symbol
    if (!source.symbolSpecific) {
      const tickers = extractTickers(headline + " " + (raw.description ?? ""));
      if (!tickers.includes(symbol)) continue;
    }

    const id = raw.guid ?? raw.link ?? headline;
    const itemKey = `${source.id}:${id}`;
    if (seenIds.has(itemKey)) continue;
    seenIds.add(itemKey);

    const { sentiment, score } = scoreSentiment(headline);
    const relatedSymbols = extractTickers(headline);

    const item: NewsItem = {
      id: itemKey,
      symbol,
      headline,
      source: source.label,
      url: raw.link ?? "",
      publishedAt: raw.pubDate ? new Date(raw.pubDate).getTime() : Date.now(),
      sentiment,
      sentimentScore: score,
      relatedSymbols,
    };

    storeItem(item);
    await publishItem(item);
    newCount++;
  }

  if (newCount > 0) {
    console.log(`[news-aggregator] ${source.label} → ${symbol}: +${newCount} items`);
  }
}

async function pollAll(): Promise<void> {
  const enabledSources = SOURCES.filter((s) => s.enabled);
  if (enabledSources.length === 0 || knownSymbols.length === 0) return;

  // Symbol-specific sources: poll for each symbol
  // General sources: poll once (they scan all symbols internally)
  const symbolSpecific = enabledSources.filter((s) => s.symbolSpecific);
  const general = enabledSources.filter((s) => !s.symbolSpecific);

  const tasks: Promise<void>[] = [];

  for (const source of symbolSpecific) {
    for (const symbol of knownSymbols) {
      tasks.push(pollSourceForSymbol(source, symbol));
    }
  }

  // For general sources, poll once per source using the first symbol as dummy context
  // but scan all symbols inside pollSourceForSymbol
  for (const source of general) {
    for (const symbol of knownSymbols) {
      tasks.push(pollSourceForSymbol(source, symbol));
    }
  }

  await Promise.allSettled(tasks);
}

async function loadSymbols(): Promise<void> {
  try {
    const res = await fetch(`${MARKET_SIM_URL}/assets`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return;
    const assets = await res.json() as { symbol: string }[];
    knownSymbols = assets.map((a) => a.symbol);
    console.log(`[news-aggregator] Loaded ${knownSymbols.length} symbols`);
  } catch {
    console.warn("[news-aggregator] Could not load symbols from market-sim");
  }
}

// Start polling loop
(async () => {
  await loadSymbols();
  await pollAll();
  setInterval(async () => {
    await loadSymbols(); // refresh in case assets change
    await pollAll();
  }, POLL_INTERVAL_MS);
})();

// ── HTTP handlers ─────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve({ port: PORT }, (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  const url = new URL(req.url);
  const path = url.pathname;

  // ── GET /health ────────────────────────────────────────────────────────────
  if (req.method === "GET" && path === "/health") {
    return json({
      service: "news-aggregator",
      version: VERSION,
      status: "ok",
      sources: SOURCES.map(({ id, label, enabled }) => ({ id, label, enabled })),
      itemCount: totalItems(),
      symbolCount: knownSymbols.length,
    });
  }

  // ── GET /news?symbol=AAPL&limit=20 ────────────────────────────────────────
  if (req.method === "GET" && path === "/news") {
    const symbol = url.searchParams.get("symbol");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), MAX_ITEMS_PER_SYMBOL);
    if (!symbol) return json({ error: "symbol is required" }, 400);
    const items = (newsBySymbol.get(symbol) ?? []).slice(0, limit);
    return json(items);
  }

  // ── GET /sources ───────────────────────────────────────────────────────────
  if (req.method === "GET" && path === "/sources") {
    return json(SOURCES.map(({ id, label, enabled, symbolSpecific }) => ({
      id, label, enabled, symbolSpecific,
    })));
  }

  // ── POST /sources/:id/enable|disable|toggle ────────────────────────────────
  const sourceMatch = path.match(/^\/sources\/([^/]+)\/(enable|disable|toggle)$/);
  if (req.method === "POST" && sourceMatch) {
    const [, id, action] = sourceMatch;
    const source = SOURCES.find((s) => s.id === id);
    if (!source) return json({ error: "source not found" }, 404);
    if (action === "enable") source.enabled = true;
    else if (action === "disable") source.enabled = false;
    else source.enabled = !source.enabled;
    console.log(`[news-aggregator] Source ${id} → enabled=${source.enabled}`);
    return json({ id: source.id, label: source.label, enabled: source.enabled, symbolSpecific: source.symbolSpecific });
  }

  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
});

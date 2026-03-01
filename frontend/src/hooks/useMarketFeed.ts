import { useEffect, useRef, useState } from "react";
import type { AssetDef, CandleHistory, MarketPrices, OhlcCandle, PriceHistory } from "../types.ts";

const MARKET_WS_URL = import.meta.env.VITE_MARKET_WS_URL ?? "ws://localhost:5000";
const MARKET_HTTP_URL = import.meta.env.VITE_MARKET_HTTP_URL ?? "http://localhost:5000";
const HISTORY_LENGTH = 60;
const MAX_CANDLES = 120;

const INTERVALS: { key: "1m" | "5m"; ms: number }[] = [
  { key: "1m", ms: 60_000 },
  { key: "5m", ms: 300_000 },
];

function bucketStart(ts: number, intervalMs: number): number {
  return Math.floor(ts / intervalMs) * intervalMs;
}

function applyTick(
  candles: OhlcCandle[],
  price: number,
  ts: number,
  intervalMs: number
): OhlcCandle[] {
  const bucket = bucketStart(ts, intervalMs);
  const last = candles[candles.length - 1];
  if (last && last.time === bucket) {
    const updated: OhlcCandle = {
      ...last,
      high: Math.max(last.high, price),
      low: Math.min(last.low, price),
      close: price,
    };
    return [...candles.slice(0, -1), updated];
  }
  const newCandle: OhlcCandle = {
    time: bucket,
    open: price,
    high: price,
    low: price,
    close: price,
  };
  return [...candles, newCandle].slice(-MAX_CANDLES);
}

export function useMarketFeed() {
  const [assets, setAssets] = useState<AssetDef[]>([]);
  const [prices, setPrices] = useState<MarketPrices>({});
  const [priceHistory, setPriceHistory] = useState<PriceHistory>({});
  const [candleHistory, setCandleHistory] = useState<CandleHistory>({});
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    fetch(`${MARKET_HTTP_URL}/assets`)
      .then((r) => r.json())
      .then((data: AssetDef[]) => {
        setAssets(data);
        setPriceHistory(Object.fromEntries(data.map((a) => [a.symbol, []])));
        setCandleHistory(Object.fromEntries(data.map((a) => [a.symbol, { "1m": [], "5m": [] }])));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function connect() {
      const ws = new WebSocket(MARKET_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            event: string;
            data:
              | MarketPrices
              | { prices: MarketPrices; volumes: Record<string, number>; marketMinute: number };
          };
          const newPrices: MarketPrices =
            msg.data !== null && typeof msg.data === "object" && "prices" in msg.data
              ? (msg.data as { prices: MarketPrices }).prices
              : (msg.data as MarketPrices);
          const ts = Date.now();
          setPrices(newPrices);
          setPriceHistory((prev) => {
            const next = { ...prev };
            for (const asset of Object.keys(newPrices)) {
              const history = [...(next[asset] ?? []), newPrices[asset]];
              next[asset] = history.slice(-HISTORY_LENGTH);
            }
            return next;
          });
          setCandleHistory((prev) => {
            const next = { ...prev };
            for (const asset of Object.keys(newPrices)) {
              const price = newPrices[asset];
              const current = next[asset] ?? { "1m": [], "5m": [] };
              const updated = { ...current };
              for (const { key, ms } of INTERVALS) {
                updated[key] = applyTick(current[key], price, ts, ms);
              }
              next[asset] = updated;
            }
            return next;
          });
        } catch {
          // unparseable WebSocket frame — safe to discard
        }
      };

      ws.onclose = () => {
        setConnected(false);
        setTimeout(connect, 2000);
      };

      ws.onerror = () => ws.close();
    }

    connect();
    return () => {
      wsRef.current?.close();
    };
  }, []);

  return { assets, prices, priceHistory, candleHistory, connected };
}

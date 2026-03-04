import { useSignal } from "@preact/signals-react";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  HistogramSeries,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import type { OhlcCandle } from "../types.ts";

type Interval = "1m" | "5m";

interface Props {
  symbol: string;
  candles: { "1m": OhlcCandle[]; "5m": OhlcCandle[] };
}

const CHART_THEME = {
  layout: {
    background: { type: ColorType.Solid, color: "#030712" },
    textColor: "#9ca3af",
    attributionLogo: false,
  },
  grid: {
    vertLines: { color: "#111827" },
    horzLines: { color: "#111827" },
  },
  crosshair: { mode: CrosshairMode.Normal },
  rightPriceScale: { borderColor: "#1f2937" },
  timeScale: { borderColor: "#1f2937", timeVisible: true, secondsVisible: false },
};

function toBarData(c: OhlcCandle) {
  return {
    time: (c.time / 1000) as UTCTimestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  };
}

function toVolData(c: OhlcCandle) {
  return {
    time: (c.time / 1000) as UTCTimestamp,
    value: c.volume ?? 0,
    color: c.close >= c.open ? "#34d39966" : "#f8717166",
  };
}

export function CandlestickChart({ symbol, candles }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const interval = useSignal<Interval>("1m");
  // Track which candle set is loaded so we know when a full reload is needed
  const loadedKeyRef = useRef<string>("");
  const lastBarTimeRef = useRef<number>(0);
  // lastLoadedFirstTimeRef lets us detect a full-replace: if the oldest candle's time changes
  const lastLoadedFirstTimeRef = useRef<number>(0);
  // Coordinate fitContent between resize and data effects:
  // fitContent should only fire once both the container has width AND data is loaded.
  const hasWidthRef = useRef(false);
  const hasDataRef = useRef(false);

  function tryFitContent() {
    if (hasWidthRef.current && hasDataRef.current) {
      chartRef.current?.timeScale().fitContent();
    }
  }

  // Create chart once on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      ...CHART_THEME,
      autoSize: true,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#34d399",
      downColor: "#f87171",
      borderUpColor: "#34d399",
      borderDownColor: "#f87171",
      wickUpColor: "#34d399",
      wickDownColor: "#f87171",
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: "#34d399",
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    // In lightweight-charts v5, overlay scale margins are set chart-wide.
    // `visible` is not applicable to overlay scales and is ignored.
    chart.applyOptions({
      overlayPriceScales: { scaleMargins: { top: 0.8, bottom: 0 } },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    // Observe container width. Once non-zero, record it and try to fit.
    // Disconnect immediately — subsequent resizes should not re-fit (preserve user zoom).
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width > 0) {
        hasWidthRef.current = true;
        ro.disconnect();
        tryFitContent();
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      hasWidthRef.current = false;
      hasDataRef.current = false;
      chart.remove();
    };
  }, []);

  // Update data when interval or candles change
  useEffect(() => {
    const cs = candleSeriesRef.current;
    const vs = volumeSeriesRef.current;
    if (!cs || !vs) return;

    const raw = candles[interval.value];
    if (raw.length === 0) return;

    const newKey = `${symbol}:${interval.value}`;
    const isNewSeries = loadedKeyRef.current !== newKey;
    const firstTime = raw[0].time;
    const last = raw[raw.length - 1];
    const lastTime = last.time;
    // Detect a full replace: series key changed, time went backwards, or the oldest bar changed
    const isFullReplace =
      isNewSeries ||
      lastTime < lastBarTimeRef.current ||
      firstTime !== lastLoadedFirstTimeRef.current;

    if (isFullReplace) {
      // Full reload — new symbol, interval switched, history seeded, or time went backwards
      cs.setData(raw.map(toBarData));
      vs.setData(raw.map(toVolData));
      loadedKeyRef.current = newKey;
      lastBarTimeRef.current = lastTime;
      lastLoadedFirstTimeRef.current = firstTime;
      // Mark data as loaded and try to fit (no-op if width not yet known)
      hasDataRef.current = true;
      requestAnimationFrame(() => tryFitContent());
    } else {
      // Incremental update — only update the last candle (tick append or bucket close)
      cs.update(toBarData(last));
      vs.update(toVolData(last));
      lastBarTimeRef.current = lastTime;
    }
  }, [candles, interval.value, symbol]);

  const raw = candles[interval.value];

  return (
    <div className="relative flex flex-col h-full bg-gray-950">
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-gray-800 shrink-0">
        <div className="flex rounded overflow-hidden border border-gray-700">
          {(["1m", "5m"] as Interval[]).map((iv) => (
            <button
              key={iv}
              type="button"
              onClick={() => {
                interval.value = iv;
              }}
              className={`px-2 py-0.5 text-xs transition-colors ${
                interval.value === iv
                  ? "bg-emerald-700 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {iv}
            </button>
          ))}
        </div>
        {raw.length > 0 && (
          <span className="ml-auto text-[10px] text-gray-600 tabular-nums">{raw.length} bars</span>
        )}
      </div>

      {raw.length === 0 && (
        <div className="absolute inset-0 top-8 flex flex-col items-center justify-center gap-3 pointer-events-none z-10">
          <svg
            aria-label="Loading"
            className="animate-spin w-6 h-6 text-emerald-500/60"
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
          <span className="text-[11px] text-gray-600">Collecting {interval.value} candles…</span>
        </div>
      )}
      <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden" />
    </div>
  );
}

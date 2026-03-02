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
  onClose: () => void;
}

const CHART_THEME = {
  layout: {
    background: { type: ColorType.Solid, color: "#030712" },
    textColor: "#9ca3af",
  },
  grid: {
    vertLines: { color: "#111827" },
    horzLines: { color: "#111827" },
  },
  crosshair: { mode: CrosshairMode.Normal },
  rightPriceScale: { borderColor: "#1f2937" },
  timeScale: { borderColor: "#1f2937", timeVisible: true, secondsVisible: true },
};

export function CandlestickChart({ symbol, candles, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const interval = useSignal<Interval>("1m");

  // Create chart once on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      ...CHART_THEME,
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#34d399",
      downColor: "#f87171",
      borderUpColor: "#34d399",
      borderDownColor: "#f87171",
      wickUpColor: "#34d399",
      wickDownColor: "#f87171",
    });

    // Volume histogram in a separate scale pane at the bottom
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: "#34d399",
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, []);

  // Update data when interval or candles change
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;
    const raw = candles[interval.value];
    if (raw.length < 2) return;

    candleSeriesRef.current.setData(
      raw.map((c) => ({
        time: (c.time / 1000) as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    volumeSeriesRef.current.setData(
      raw.map((c) => ({
        time: (c.time / 1000) as UTCTimestamp,
        value: c.volume ?? 0,
        color: c.close >= c.open ? "#34d39966" : "#f8717166",
      }))
    );

    chartRef.current?.timeScale().fitContent();
  }, [candles, interval.value]);

  const raw = candles[interval.value];

  return (
    <div className="flex flex-col h-full bg-gray-950">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-100">{symbol}</span>
          <span className="text-xs text-gray-500">Candlestick</span>
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
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-500 hover:text-gray-200 text-sm px-1 transition-colors"
          aria-label="Close chart"
        >
          ✕
        </button>
      </div>

      {raw.length < 2 ? (
        <div className="flex-1 flex items-center justify-center text-gray-600 text-xs">
          Collecting {interval.value} candles…
        </div>
      ) : (
        <div ref={containerRef} className="flex-1" />
      )}
    </div>
  );
}

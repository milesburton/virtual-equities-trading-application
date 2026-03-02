import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import { ColorType, createChart, HistogramSeries } from "lightweight-charts";
import { useEffect, useRef } from "react";
import { useAppSelector } from "../store/hooks.ts";

interface Props {
  symbol: string;
}

export function MarketDepth({ symbol }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const bidSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const askSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  const snapshot = useAppSelector((s) => s.market.orderBook[symbol]);

  // Create chart on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#030712" },
        textColor: "#9ca3af",
      },
      grid: {
        vertLines: { color: "#111827" },
        horzLines: { color: "#111827" },
      },
      rightPriceScale: { borderColor: "#1f2937" },
      timeScale: { visible: false },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    // Bid side — green, positive values (size)
    const bidSeries = chart.addSeries(HistogramSeries, {
      color: "#34d399",
      priceFormat: { type: "volume" },
      priceScaleId: "right",
      base: 0,
    });

    // Ask side — red, plotted as negative values so they face left
    const askSeries = chart.addSeries(HistogramSeries, {
      color: "#f87171",
      priceFormat: { type: "volume" },
      priceScaleId: "right",
      base: 0,
    });

    chartRef.current = chart;
    bidSeriesRef.current = bidSeries;
    askSeriesRef.current = askSeries;

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

  // Update depth data when snapshot changes
  useEffect(() => {
    if (!bidSeriesRef.current || !askSeriesRef.current || !snapshot) return;

    // Use a fake timestamp base — depth chart is a snapshot, not a time-series.
    // We map each price level to an incrementing integer timestamp so lightweight-charts
    // can render them as ordered bars.
    const now = Math.floor(Date.now() / 1000) as UTCTimestamp;

    bidSeriesRef.current.setData(
      snapshot.bids.map((level, i) => ({
        time: (now - i) as UTCTimestamp,
        value: level.size,
        color: "#34d39966",
      }))
    );

    askSeriesRef.current.setData(
      snapshot.asks.map((level, i) => ({
        time: (now + i + 1) as UTCTimestamp,
        value: level.size,
        color: "#f8717166",
      }))
    );

    chartRef.current?.timeScale().fitContent();
  }, [snapshot]);

  return (
    <div className="flex flex-col h-full bg-gray-950">
      <div className="px-3 py-2 border-b border-gray-700 shrink-0 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Market Depth
        </span>
        {snapshot ? (
          <span className="font-mono text-xs text-gray-500">
            mid{" "}
            <span className="text-gray-300">
              {snapshot.mid.toFixed(symbol.includes("/") ? 4 : 2)}
            </span>
          </span>
        ) : (
          <span className="text-xs text-gray-600">waiting for data…</span>
        )}
      </div>
      {snapshot ? (
        <div ref={containerRef} className="flex-1" />
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-600 text-xs">
          No depth data for {symbol}
        </div>
      )}
    </div>
  );
}

import { useSignal } from "@preact/signals-react";
import {
  Bar,
  ComposedChart,
  Rectangle,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { OhlcCandle } from "../types.ts";

type Interval = "1m" | "5m";

interface Props {
  symbol: string;
  candles: { "1m": OhlcCandle[]; "5m": OhlcCandle[] };
  onClose: () => void;
}

function formatTime(ts: number, interval: Interval) {
  const d = new Date(ts);
  if (interval === "5m") {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

interface CandleBarProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: OhlcCandle & { bodyTop: number; bodyBottom: number; wickHigh: number; wickLow: number };
}

function CandleBar(props: CandleBarProps) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  if (!payload) return null;

  const { open, close } = payload;
  const bullish = close >= open;
  const color = bullish ? "#34d399" : "#f87171";
  const cx = x + width / 2;

  // `y` and `height` are pixel coordinates provided by Recharts for the bar body.
  const bodyY = y;
  const bodyH = Math.max(height, 1);
  const wickTop = y; // approximate wick using the top of the bar
  const wickBottom = y + bodyH; // and bottom of the bar

  return (
    <g>
      <line x1={cx} y1={wickTop} x2={cx} y2={wickBottom} stroke={color} strokeWidth={1} />
      <Rectangle
        x={x + 1}
        y={bodyY}
        width={Math.max(width - 2, 1)}
        height={bodyH}
        fill={color}
        stroke={color}
      />
    </g>
  );
}

interface TooltipPayload {
  payload?: OhlcCandle;
}

function CandleTooltip({
  active,
  payload,
  interval,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  interval: Interval;
}) {
  if (!active || !payload?.length || !payload[0].payload) return null;
  const c = payload[0].payload;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs space-y-0.5">
      <div className="text-gray-400">{formatTime(c.time, interval)}</div>
      <div className="text-gray-300">
        O <span className="tabular-nums text-gray-100">{c.open.toFixed(2)}</span>
      </div>
      <div className="text-gray-300">
        H <span className="tabular-nums text-emerald-400">{c.high.toFixed(2)}</span>
      </div>
      <div className="text-gray-300">
        L <span className="tabular-nums text-red-400">{c.low.toFixed(2)}</span>
      </div>
      <div className="text-gray-300">
        C <span className="tabular-nums text-gray-100">{c.close.toFixed(2)}</span>
      </div>
    </div>
  );
}

export function CandlestickChart({ symbol, candles, onClose }: Props) {
  const interval = useSignal<Interval>("1m");
  const raw = candles[interval.value];

  const data = raw.map((c) => {
    const bodyTop = Math.min(c.open, c.close);
    const bodyBottom = Math.max(c.open, c.close);
    return {
      ...c,
      bodyTop,
      bodyBottom,
      wickHigh: c.high,
      wickLow: c.low,
      range: [bodyBottom, bodyTop] as [number, number],
    };
  });

  const allValues = raw.flatMap((c) => [c.high, c.low]);
  const yMin = allValues.length ? Math.min(...allValues) * 0.9995 : 0;
  const yMax = allValues.length ? Math.max(...allValues) * 1.0005 : 100;

  return (
    <div className="flex flex-col h-full bg-gray-950">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-100">{symbol}</span>
          <span className="text-xs text-gray-500">Candlestick</span>
          <div className="flex rounded overflow-hidden border border-gray-700">
            {(["1m", "5m"] as Interval[]).map((iv) => (
              <button
                key={iv}
                type="button"
                onClick={() => { interval.value = iv; }}
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

      {data.length < 2 ? (
        <div className="flex-1 flex items-center justify-center text-gray-600 text-xs">
          Collecting {interval.value} candles…
        </div>
      ) : (
        <div className="flex-1 p-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <XAxis
                dataKey="time"
                tickFormatter={(ts: number) => formatTime(ts, interval.value)}
                tick={{ fill: "#6b7280", fontSize: 10 }}
                axisLine={{ stroke: "#374151" }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[yMin, yMax]}
                tick={{ fill: "#6b7280", fontSize: 10 }}
                axisLine={{ stroke: "#374151" }}
                tickLine={false}
                tickFormatter={(v: number) => v.toFixed(2)}
                width={52}
              />
              <Tooltip content={<CandleTooltip interval={interval.value} />} />
              <Bar dataKey="range" shape={<CandleBar />} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { List } from "react-window";
import { Line, LineChart, ResponsiveContainer, Tooltip } from "recharts";
import type { AssetDef, MarketPrices, PriceHistory } from "../types.ts";

const SPREAD = 0.0001;
const ROW_HEIGHT = 40;

interface Props {
  assets: AssetDef[];
  prices: MarketPrices;
  priceHistory: PriceHistory;
  selectedAsset: string | null;
  onSelectAsset: (symbol: string | null) => void;
}

function formatPrice(symbol: string, price: number) {
  return symbol.includes("/") ? price.toFixed(4) : price.toFixed(2);
}

function PriceFlash({ value, asset }: { value: number; asset: string }) {
  const prevRef = useRef<number | null>(null);
  const [flashClass, setFlashClass] = useState("");

  useEffect(() => {
    if (prevRef.current === null) {
      prevRef.current = value;
      return;
    }
    const dir =
      value > prevRef.current ? "flash-green" : value < prevRef.current ? "flash-red" : "";
    prevRef.current = value;
    if (!dir) return;
    setFlashClass(dir);
    const t = setTimeout(() => setFlashClass(""), 400);
    return () => clearTimeout(t);
  }, [value]);

  const colorClass =
    flashClass === "flash-green"
      ? "text-emerald-400"
      : flashClass === "flash-red"
        ? "text-red-400"
        : "text-gray-100";

  return (
    <span className={`tabular-nums transition-colors duration-300 ${colorClass}`}>
      {formatPrice(asset, value)}
    </span>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const chartData = data.map((v) => ({ v }));
  const isUp = data.length >= 2 && data[data.length - 1] >= data[0];
  return (
    <ResponsiveContainer width={60} height={28}>
      <LineChart data={chartData}>
        <Line
          type="monotone"
          dataKey="v"
          dot={false}
          strokeWidth={1.5}
          stroke={isUp ? "#34d399" : "#f87171"}
        />
        <Tooltip contentStyle={{ display: "none" }} cursor={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Props that we supply via rowProps (user data, not injected by the library)
interface RowData {
  filtered: AssetDef[];
  prices: MarketPrices;
  priceHistory: PriceHistory;
  selectedAsset: string | null;
  onSelectAsset: (symbol: string | null) => void;
}

// Full props as received by the row component (library injects ariaAttributes, index, style)
interface RowComponentProps extends RowData {
  ariaAttributes: { "aria-posinset": number; "aria-setsize": number; role: "listitem" };
  index: number;
  style: React.CSSProperties;
}

function Row({
  index,
  style,
  filtered,
  prices,
  priceHistory,
  selectedAsset,
  onSelectAsset,
  ariaAttributes,
}: RowComponentProps) {
  const asset = filtered[index];
  if (!asset) return null;

  const price = prices[asset.symbol] ?? 0;
  const history = priceHistory[asset.symbol] ?? [];
  const open = history[0] ?? price;
  const changePct = open > 0 ? ((price - open) / open) * 100 : 0;
  const bid = price * (1 - SPREAD);
  const ask = price * (1 + SPREAD);
  const changePos = changePct >= 0;
  const isSelected = selectedAsset === asset.symbol;

  function handleSelect() {
    onSelectAsset(isSelected ? null : asset.symbol);
  }

  return (
    <button
      type="button"
      style={style}
      {...ariaAttributes}
      className={`w-full flex items-center border-b border-gray-800/40 cursor-pointer transition-colors text-xs bg-transparent text-left ${
        isSelected ? "bg-emerald-900/30" : "hover:bg-gray-800/30"
      }`}
      onClick={handleSelect}
    >
      <div className="w-[90px] px-3 flex-shrink-0">
        <div className="font-semibold text-gray-200 leading-tight">{asset.symbol}</div>
        <div className="text-gray-600 text-[10px] leading-tight truncate">{asset.sector}</div>
      </div>
      <div className="w-[64px] text-right px-2 text-sky-400 tabular-nums flex-shrink-0">
        {price > 0 ? formatPrice(asset.symbol, bid) : "—"}
      </div>
      <div className="w-[64px] text-right px-2 text-red-400 tabular-nums flex-shrink-0">
        {price > 0 ? formatPrice(asset.symbol, ask) : "—"}
      </div>
      <div className="w-[64px] text-right px-2 flex-shrink-0">
        {price > 0 ? (
          <PriceFlash value={price} asset={asset.symbol} />
        ) : (
          <span className="text-gray-600">—</span>
        )}
      </div>
      <div
        className={`w-[56px] text-right px-2 tabular-nums flex-shrink-0 ${changePos ? "text-emerald-400" : "text-red-400"}`}
      >
        {price > 0 ? `${changePos ? "+" : ""}${changePct.toFixed(2)}%` : "—"}
      </div>
      <div className="flex-1 flex justify-end pr-2">
        {history.length > 1 ? <Sparkline data={history.slice(-30)} /> : null}
      </div>
    </button>
  );
}

export function MarketLadder({
  assets,
  prices,
  priceHistory,
  selectedAsset,
  onSelectAsset,
}: Props) {
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState("All");
  const containerRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState(400);

  const sectors = ["All", ...Array.from(new Set(assets.map((a) => a.sector))).sort()];

  const filtered = assets.filter((a) => {
    const matchSearch =
      a.symbol.toLowerCase().includes(search.toLowerCase()) ||
      a.sector.toLowerCase().includes(search.toLowerCase());
    const matchSector = sectorFilter === "All" || a.sector === sectorFilter;
    return matchSearch && matchSector;
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      setListHeight(entries[0].contentRect.height);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const rowData: RowData = { filtered, prices, priceHistory, selectedAsset, onSelectAsset };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-gray-700 text-xs font-semibold text-gray-400 uppercase tracking-wider">
        Market Ladder
        <span className="ml-2 text-gray-600 normal-case font-normal">
          {filtered.length}/{assets.length}
        </span>
      </div>

      <div className="px-2 py-1.5 border-b border-gray-800 flex gap-1.5">
        <input
          type="search"
          placeholder="Search symbol or sector…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1 focus:outline-none focus:border-emerald-500 min-w-0"
        />
        <select
          value={sectorFilter}
          onChange={(e) => setSectorFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-gray-400 text-xs rounded px-1.5 py-1 focus:outline-none focus:border-emerald-500"
        >
          {sectors.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="flex text-xs text-gray-500 border-b border-gray-800 bg-gray-950">
        <div className="w-[90px] px-3 py-1.5 flex-shrink-0">Symbol</div>
        <div className="w-[64px] text-right px-2 py-1.5 flex-shrink-0">Bid</div>
        <div className="w-[64px] text-right px-2 py-1.5 flex-shrink-0">Ask</div>
        <div className="w-[64px] text-right px-2 py-1.5 flex-shrink-0">Last</div>
        <div className="w-[56px] text-right px-2 py-1.5 flex-shrink-0">Δ%</div>
        <div className="flex-1 text-right pr-2 py-1.5">Chart</div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-hidden">
        <List<RowData>
          rowComponent={Row}
          rowCount={filtered.length}
          rowHeight={ROW_HEIGHT}
          rowProps={rowData}
          overscanCount={5}
          style={{ height: `${listHeight}px` }}
        />
      </div>
    </div>
  );
}

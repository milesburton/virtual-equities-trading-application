import { useSignal } from "@preact/signals-react";
import { memo, useEffect, useMemo, useRef } from "react";
import { List } from "react-window";
import { useChannelContext } from "../contexts/ChannelContext.tsx";
import { useChannelOut } from "../hooks/useChannelOut.ts";
import { useAppSelector } from "../store/hooks.ts";
import type { AssetDef, MarketPrices, OrderBookSnapshot, PriceHistory } from "../types.ts";
import type { ContextMenuEntry } from "./ContextMenu.tsx";
import { ContextMenu } from "./ContextMenu.tsx";
import { CHANNEL_COLOURS } from "./DashboardLayout.tsx";
import { PopOutButton } from "./PopOutButton.tsx";

const ROW_HEIGHT = 48; // taller to show second info line

function formatPrice(symbol: string, price: number) {
  return symbol.includes("/") ? price.toFixed(4) : price.toFixed(2);
}

function PriceFlash({ value, asset }: { value: number; asset: string }) {
  const prevRef = useRef<number | null>(null);
  const flashClass = useSignal("");

  useEffect(() => {
    if (prevRef.current === null) {
      prevRef.current = value;
      return;
    }
    const dir =
      value > prevRef.current ? "flash-green" : value < prevRef.current ? "flash-red" : "";
    prevRef.current = value;
    if (!dir) return;
    flashClass.value = dir;
    const t = setTimeout(() => {
      flashClass.value = "";
    }, 400);
    return () => clearTimeout(t);
  }, [value, flashClass]);

  const colorClass =
    flashClass.value === "flash-green"
      ? "text-emerald-400"
      : flashClass.value === "flash-red"
        ? "text-red-400"
        : "text-gray-100";

  return (
    <span className={`tabular-nums transition-colors duration-300 ${colorClass}`}>
      {formatPrice(asset, value)}
    </span>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const isUp = data[data.length - 1] >= data[0];
    ctx.strokeStyle = isUp ? "#34d399" : "#f87171";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((data[i] - min) / range) * height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [data]);
  return <canvas ref={canvasRef} width={60} height={28} className="block" />;
}

interface RowData {
  filtered: AssetDef[];
  prices: MarketPrices;
  priceHistory: PriceHistory;
  orderBook: Record<string, OrderBookSnapshot>;
  selectedAsset: string | null;
  channelHex: string | null; // colour of the outgoing channel, null if unlinked
  onSelectAsset: (symbol: string | null) => void;
  onContextMenu: (e: React.MouseEvent, symbol: string) => void;
}

interface RowComponentProps extends RowData {
  ariaAttributes: { "aria-posinset": number; "aria-setsize": number; role: "listitem" };
  index: number;
  style: React.CSSProperties;
  onContextMenu: (e: React.MouseEvent, symbol: string) => void;
}

const Row = memo(function Row({
  index,
  style,
  filtered,
  prices,
  priceHistory,
  orderBook,
  selectedAsset,
  channelHex,
  onSelectAsset,
  onContextMenu,
  ariaAttributes,
}: RowComponentProps) {
  const asset = filtered[index];
  if (!asset) return null;

  const price = prices[asset.symbol] ?? 0;
  const history = priceHistory[asset.symbol] ?? [];
  const open = history[0] ?? price;
  const changePct = open > 0 ? ((price - open) / open) * 100 : 0;

  const book = orderBook[asset.symbol];
  const bid = book?.bids[0]?.price ?? price * (1 - 0.0005);
  const ask = book?.asks[0]?.price ?? price * (1 + 0.0005);
  const spreadBps = price > 0 ? ((ask - bid) / price) * 10_000 : 0;
  const changePos = changePct >= 0;
  const isSelected = selectedAsset === asset.symbol;

  function handleSelect() {
    onSelectAsset(isSelected ? null : asset.symbol);
  }

  const accentColour = isSelected ? (channelHex ?? "#34d399") : undefined;

  return (
    <button
      type="button"
      style={{
        ...style,
        borderLeft: isSelected ? `3px solid ${accentColour}` : "3px solid transparent",
      }}
      {...ariaAttributes}
      className={`w-full flex items-center border-b border-gray-800/40 cursor-pointer transition-colors text-xs bg-transparent text-left ${
        isSelected ? "bg-gray-800/60" : "hover:bg-gray-800/30"
      }`}
      onMouseDown={(e) => {
        e.preventDefault();
      }}
      onClick={handleSelect}
      onContextMenu={(e) => onContextMenu(e, asset.symbol)}
      aria-pressed={isSelected}
      aria-label={`${asset.symbol} — ${asset.sector}. Bid ${price > 0 ? formatPrice(asset.symbol, bid) : "unavailable"}, Ask ${price > 0 ? formatPrice(asset.symbol, ask) : "unavailable"}, Last ${price > 0 ? formatPrice(asset.symbol, price) : "unavailable"}, change ${price > 0 ? `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%` : "unavailable"}. ${isSelected ? "Selected — click to deselect" : "Click to select and view in chart"}`}
      title={
        isSelected
          ? "Click again to deselect"
          : "Click to select and view in chart, order ticket, and market depth"
      }
    >
      <div className="w-[90px] px-3 flex-shrink-0">
        <div
          className="font-semibold leading-tight"
          style={{ color: isSelected ? (accentColour ?? "#34d399") : "#e5e7eb" }}
        >
          {asset.symbol}
        </div>
        <div className="text-gray-600 text-[9px] leading-tight truncate">{asset.sector}</div>
        {asset.beta !== undefined && (
          <div className="text-gray-700 text-[9px] leading-tight">
            β{asset.beta.toFixed(2)}
            {asset.marketCapB !== undefined && (
              <span className="ml-1">
                {asset.marketCapB >= 1000
                  ? `${(asset.marketCapB / 1000).toFixed(1)}T`
                  : `${asset.marketCapB.toFixed(0)}B`}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="w-[64px] text-right px-2 flex-shrink-0">
        <div className="text-sky-400 tabular-nums text-[10px]">
          {price > 0 ? formatPrice(asset.symbol, bid) : "—"}
        </div>
        {price > 0 && (
          <div className="text-gray-700 text-[9px] tabular-nums">{spreadBps.toFixed(1)}bp</div>
        )}
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
      <div className="flex-1 flex items-center justify-end pr-2 gap-1.5">
        {isSelected && accentColour && (
          <span
            className="text-[8px] font-mono font-bold px-1 py-0.5 rounded leading-none"
            style={{
              color: accentColour,
              backgroundColor: `${accentColour}22`,
              border: `1px solid ${accentColour}55`,
            }}
          >
            → {channelHex ? "linked" : "ch"}
          </span>
        )}
        {history.length > 1 ? <Sparkline data={history.slice(-30)} /> : null}
      </div>
    </button>
  );
});

export function MarketLadder() {
  const broadcast = useChannelOut();
  const { outgoing } = useChannelContext();
  const channelHex = outgoing !== null ? (CHANNEL_COLOURS[outgoing]?.hex ?? null) : null;
  const assets = useAppSelector((s) => s.market.assets);
  const prices = useAppSelector((s) => s.market.prices);
  const priceHistory = useAppSelector((s) => s.market.priceHistory);
  const orderBook = useAppSelector((s) => s.market.orderBook);

  const search = useSignal("");
  const sectorFilter = useSignal("All");
  const localSelected = useSignal<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listHeight = useSignal(400);
  const ctxMenu = useSignal<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);

  const sectors = useMemo(
    () => ["All", ...Array.from(new Set(assets.map((a) => a.sector))).sort()],
    [assets]
  );

  const filtered = useMemo(
    () =>
      assets.filter((a) => {
        const matchSearch =
          a.symbol.toLowerCase().includes(search.value.toLowerCase()) ||
          a.sector.toLowerCase().includes(search.value.toLowerCase());
        const matchSector = sectorFilter.value === "All" || a.sector === sectorFilter.value;
        return matchSearch && matchSector;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assets, search.value, sectorFilter.value]
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      listHeight.value = entries[0].contentRect.height;
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [listHeight]);

  function onSelectAsset(symbol: string | null) {
    localSelected.value = symbol;
    broadcast({ selectedAsset: symbol });
  }

  function handleRowContextMenu(e: React.MouseEvent, symbol: string) {
    e.preventDefault();
    e.stopPropagation();
    const price = prices[symbol] ?? 0;
    const book = orderBook[symbol];
    const ask = book?.asks[0]?.price ?? price * 1.0005;
    const items: ContextMenuEntry[] = [
      {
        label: localSelected.value === symbol ? "Deselect" : "Select asset",
        icon: "↗",
        onClick: () => onSelectAsset(localSelected.value === symbol ? null : symbol),
      },
      { separator: true, label: symbol },
      {
        label: `View in order ticket (ask ${price > 0 ? ask.toFixed(2) : "—"})`,
        icon: "▲",
        title: "Select this asset so it loads in the linked Order Ticket",
        onClick: () => {
          onSelectAsset(symbol);
        },
      },
      {
        label: "View chart & depth",
        icon: "📊",
        title: "Select this asset to load it in linked Chart and Market Depth panels",
        onClick: () => {
          onSelectAsset(symbol);
        },
      },
      { separator: true },
      {
        label: "Copy symbol",
        icon: "⎘",
        onClick: () => navigator.clipboard.writeText(symbol),
      },
    ];
    ctxMenu.value = { x: e.clientX, y: e.clientY, items };
  }

  // Auto-select the first asset once data arrives
  // biome-ignore lint/correctness/useExhaustiveDependencies: localSelected and broadcast are stable signal/callback refs
  useEffect(() => {
    if (localSelected.value !== null) return;
    const first = assets[0];
    if (first && prices[first.symbol]) {
      localSelected.value = first.symbol;
      broadcast({ selectedAsset: first.symbol });
    }
  }, [assets, prices]);

  const rowData: RowData = {
    filtered,
    prices,
    priceHistory,
    orderBook,
    selectedAsset: localSelected.value,
    channelHex,
    onSelectAsset,
    onContextMenu: handleRowContextMenu,
  };

  return (
    <div className="flex flex-col h-full">
      {ctxMenu.value && (
        <ContextMenu
          items={ctxMenu.value.items}
          x={ctxMenu.value.x}
          y={ctxMenu.value.y}
          onClose={() => {
            ctxMenu.value = null;
          }}
        />
      )}
      <div className="px-2 py-1.5 border-b border-gray-800 flex gap-1.5 items-center">
        <PopOutButton panelId="market-ladder" />
        <span className="text-gray-600 text-[10px] tabular-nums ml-auto">
          {filtered.length}/{assets.length}
        </span>
      </div>

      <div className="px-2 py-1.5 border-b border-gray-800 flex gap-1.5">
        <input
          type="search"
          aria-label="Search by symbol or sector"
          placeholder="Search symbol or sector…"
          value={search.value}
          onChange={(e) => {
            search.value = e.target.value;
          }}
          className="flex-1 bg-gray-800 border border-gray-700 text-gray-100 text-xs rounded px-2 py-1 focus:outline-none focus:border-emerald-500 min-w-0"
        />
        <select
          aria-label="Filter by sector"
          title="Filter assets by sector"
          value={sectorFilter.value}
          onChange={(e) => {
            sectorFilter.value = e.target.value;
          }}
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
        <div className="w-[90px] px-3 py-1.5 flex-shrink-0" title="Ticker symbol and sector">
          Symbol
        </div>
        <div
          className="w-[64px] text-right px-2 py-1.5 flex-shrink-0"
          title="Best bid price — highest price a buyer will pay"
        >
          Bid
        </div>
        <div
          className="w-[64px] text-right px-2 py-1.5 flex-shrink-0"
          title="Best ask price — lowest price a seller will accept"
        >
          Ask
        </div>
        <div className="w-[64px] text-right px-2 py-1.5 flex-shrink-0" title="Last traded price">
          Last
        </div>
        <div
          className="w-[56px] text-right px-2 py-1.5 flex-shrink-0"
          title="Percentage change since session open"
        >
          Δ%
        </div>
        <div className="flex-1 text-right pr-2 py-1.5" title="Price trend over last 30 ticks">
          Trend
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-hidden">
        <List<RowData>
          rowComponent={Row as Parameters<typeof List<RowData>>[0]["rowComponent"]}
          rowCount={filtered.length}
          rowHeight={ROW_HEIGHT}
          rowProps={rowData}
          overscanCount={5}
          style={{ height: `${listHeight.value}px` }}
        />
      </div>
    </div>
  );
}

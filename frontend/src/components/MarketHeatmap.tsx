import { useSignal } from "@preact/signals-react";
import { useEffect, useMemo, useRef } from "react";
import { useChannelOut } from "../hooks/useChannelOut.ts";
import { useAppSelector } from "../store/hooks.ts";
import type { AssetDef } from "../types.ts";

// ── Colour scale ──────────────────────────────────────────────────────────────
// Solid saturated fills matching reference heatmap style (deep red → deep green)

function pctToColor(pct: number): string {
  if (pct >= 4) return "#14532d"; // darkest green
  if (pct >= 2) return "#166534";
  if (pct >= 1) return "#15803d";
  if (pct >= 0.5) return "#16a34a";
  if (pct > 0) return "#1d6334";
  if (pct === 0) return "#1f2937";
  if (pct > -0.5) return "#7c1d1d";
  if (pct > -1) return "#991b1b";
  if (pct > -2) return "#b91c1c";
  if (pct > -4) return "#dc2626";
  return "#ef4444"; // deepest red
}

function tileTextColor(pct: number): string {
  return Math.abs(pct) < 0.25 ? "#6b7280" : "#f0fdf4";
}

// ── Squarified treemap ────────────────────────────────────────────────────────

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface TileData {
  symbol: string;
  sector: string;
  pct: number;
  size: number;
}

interface LayoutTile extends TileData, Rect {}

/**
 * Classic squarified treemap (Bruls et al.).
 * Items must be sorted descending by size before calling.
 */
function squarify(items: TileData[], bounds: Rect): LayoutTile[] {
  if (items.length === 0 || bounds.w <= 0 || bounds.h <= 0) return [];

  const total = items.reduce((s, d) => s + d.size, 0);
  if (total <= 0) return [];

  const result: LayoutTile[] = [];
  let remaining = [...items];
  let { x, y, w, h } = bounds;
  const area = bounds.w * bounds.h;

  function worst(row: TileData[], sideLen: number): number {
    const s = row.reduce((acc, d) => acc + d.size, 0);
    const s2 = s * s;
    const sideLen2 = sideLen * sideLen;
    let max = 0;
    for (const d of row) {
      const a = (d.size / total) * area;
      const r1 = (sideLen2 * d.size) / s2;
      const r2 = s2 / (sideLen2 * d.size);
      const ratio = Math.max(r1, r2, a > 0 ? 1 / a : Infinity);
      if (ratio > max) max = ratio;
    }
    return max;
  }

  function layoutRow(
    row: TileData[],
    x0: number,
    y0: number,
    w0: number,
    h0: number,
    horiz: boolean
  ) {
    const rowSum = row.reduce((s, d) => s + d.size, 0);
    const stripW = horiz ? ((rowSum / total) * area) / h0 : ((rowSum / total) * area) / w0;
    let cursor = 0;
    for (const item of row) {
      const frac = item.size / rowSum;
      if (horiz) {
        result.push({ ...item, x: x0, y: y0 + cursor, w: stripW, h: frac * h0 });
        cursor += frac * h0;
      } else {
        result.push({ ...item, x: x0 + cursor, y: y0, w: frac * w0, h: stripW });
        cursor += frac * w0;
      }
    }
    return stripW;
  }

  while (remaining.length > 0) {
    const horiz = w >= h;
    const sideLen = horiz ? h : w;

    let row: TileData[] = [];
    let i = 0;
    while (i < remaining.length) {
      const next = [...row, remaining[i]];
      if (row.length === 0 || worst(next, sideLen) <= worst(row, sideLen)) {
        row = next;
        i++;
      } else {
        break;
      }
    }
    if (row.length === 0) {
      row = [remaining[0]];
    }

    const stripW = layoutRow(row, x, y, w, h, horiz);
    remaining = remaining.slice(row.length);

    if (horiz) {
      x += stripW;
      w -= stripW;
    } else {
      y += stripW;
      h -= stripW;
    }
  }

  return result;
}

// ── Component ─────────────────────────────────────────────────────────────────

const SECTOR_LABEL_H = 17; // px — height reserved for sector header strip
const GAP = 2; // px — gap between tiles / sectors

export function MarketHeatmap() {
  const assets = useAppSelector((s) => s.market.assets);
  const prices = useAppSelector((s) => s.market.prices);
  const priceHistory = useAppSelector((s) => s.market.priceHistory);
  const broadcast = useChannelOut();

  const hovered = useSignal<string | null>(null);
  const sortBy = useSignal<"cap" | "change">("cap");

  // Responsive canvas — observe the wrapper div
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasW = useSignal(960);
  const canvasH = useSignal(540);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0) canvasW.value = width;
      if (height > 0) canvasH.value = height;
    });
    ro.observe(el);
    // seed from initial size
    canvasW.value = el.clientWidth || 960;
    canvasH.value = el.clientHeight || 540;
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    canvasH, // seed from initial size
    canvasW,
  ]);

  // Per-asset % change from session open
  const tiles = useMemo<TileData[]>(() => {
    return assets.map((a: AssetDef) => {
      const price = prices[a.symbol] ?? a.initialPrice;
      const history = priceHistory[a.symbol] ?? [];
      const open = history[0] ?? a.initialPrice;
      const pct = open > 0 ? ((price - open) / open) * 100 : 0;
      const size = sortBy.value === "cap" ? (a.marketCapB ?? 1) : Math.max(Math.abs(pct), 0.1);
      return { symbol: a.symbol, sector: a.sector, pct, size };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, prices, priceHistory, sortBy.value]);

  // Group and sort sectors by total weight
  const sectors = useMemo(() => {
    const map = new Map<string, TileData[]>();
    for (const t of tiles) {
      if (!map.has(t.sector)) map.set(t.sector, []);
      map.get(t.sector)?.push(t);
    }
    return Array.from(map.entries())
      .map(([sector, items]) => {
        const totalSize = items.reduce((s, d) => s + d.size, 0);
        const sectorPct =
          totalSize > 0 ? items.reduce((s, d) => s + d.pct * d.size, 0) / totalSize : 0;
        return { sector, items: [...items].sort((a, b) => b.size - a.size), totalSize, sectorPct };
      })
      .sort((a, b) => b.totalSize - a.totalSize);
  }, [tiles]);

  const cw = canvasW.value;
  const ch = canvasH.value;

  // Sector layout across the full canvas
  const sectorTileData: TileData[] = sectors.map((s) => ({
    symbol: s.sector,
    sector: s.sector,
    pct: s.sectorPct,
    size: s.totalSize,
  }));
  const sectorLayout = squarify(sectorTileData, { x: 0, y: 0, w: cw, h: ch });

  // Asset tile layout within each sector block
  const sectorBlocks = sectors.map((s, i) => {
    const sRect = sectorLayout[i];
    if (!sRect) return { ...s, tiles: [] as LayoutTile[] };

    const inner: Rect = {
      x: sRect.x + GAP,
      y: sRect.y + SECTOR_LABEL_H + GAP,
      w: Math.max(sRect.w - GAP * 2, 1),
      h: Math.max(sRect.h - SECTOR_LABEL_H - GAP * 2, 1),
    };
    return { ...s, sRect, tiles: squarify(s.items, inner) };
  });

  return (
    <div className="flex flex-col h-full bg-gray-950 text-gray-100 select-none">
      {/* Toolbar */}
      <div className="px-3 py-1.5 border-b border-gray-800 flex items-center gap-3 shrink-0 text-[11px]">
        <span className="font-semibold text-gray-400 uppercase tracking-wider">Market Heatmap</span>

        <div className="flex rounded border border-gray-700 overflow-hidden text-[10px] ml-2">
          {(["cap", "change"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                sortBy.value = mode;
              }}
              aria-pressed={sortBy.value === mode}
              className={`px-2 py-0.5 transition-colors ${
                sortBy.value === mode
                  ? "bg-gray-700 text-gray-200"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {mode === "cap" ? "By Cap" : "By Move"}
            </button>
          ))}
        </div>

        {/* Colour legend */}
        <div className="ml-auto flex items-center gap-2 text-[9px] text-gray-500">
          {([-4, -2, -0.5, 0, 0.5, 2, 4] as const).map((v) => (
            <span key={v} className="flex items-center gap-0.5">
              <span
                className="inline-block w-3 h-2.5 rounded-sm border border-gray-800"
                style={{ background: pctToColor(v) }}
              />
              <span>{v > 0 ? `+${v}` : v}%</span>
            </span>
          ))}
        </div>
      </div>

      {/* SVG canvas — fills remaining space */}
      <div ref={wrapRef} className="flex-1 overflow-hidden relative">
        <svg
          width={cw}
          height={ch}
          viewBox={`0 0 ${cw} ${ch}`}
          aria-label="Market heatmap — sector treemap coloured by % price change"
          role="img"
        >
          {sectorBlocks.map((block, si) => {
            const sRect = sectorLayout[si];
            if (!sRect || sRect.w < 4 || sRect.h < 4) return null;
            const sColor = pctToColor(block.sectorPct);

            return (
              <g key={block.sector}>
                {/* Sector background */}
                <rect
                  x={sRect.x + 1}
                  y={sRect.y + 1}
                  width={sRect.w - 2}
                  height={sRect.h - 2}
                  fill="#111827"
                  stroke="#374151"
                  strokeWidth={1}
                  rx={2}
                />

                {/* Sector header bar */}
                <rect
                  x={sRect.x + 1}
                  y={sRect.y + 1}
                  width={sRect.w - 2}
                  height={SECTOR_LABEL_H - 1}
                  fill={sColor}
                  opacity={0.75}
                  rx={2}
                />

                {/* Sector name */}
                <text
                  x={sRect.x + 6}
                  y={sRect.y + 12}
                  fontSize={9}
                  fontWeight="700"
                  fill="#f3f4f6"
                  style={{
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    pointerEvents: "none",
                  }}
                >
                  {sRect.w > 80
                    ? block.sector
                    : block.sector.slice(0, Math.max(Math.floor(sRect.w / 7), 3))}
                </text>

                {/* Sector % change — right-aligned in header */}
                {sRect.w > 70 && (
                  <text
                    x={sRect.x + sRect.w - 6}
                    y={sRect.y + 12}
                    fontSize={9}
                    fontWeight="600"
                    fill={block.sectorPct >= 0 ? "#86efac" : "#fca5a5"}
                    textAnchor="end"
                    style={{ pointerEvents: "none" }}
                  >
                    {block.sectorPct >= 0 ? "+" : ""}
                    {block.sectorPct.toFixed(2)}%
                  </text>
                )}

                {/* Asset tiles */}
                {block.tiles.map((tile) => {
                  const tw = Math.max(tile.w - GAP, 1);
                  const th = Math.max(tile.h - GAP, 1);
                  const tx = tile.x + GAP / 2;
                  const ty = tile.y + GAP / 2;
                  const isHovered = hovered.value === tile.symbol;
                  const color = pctToColor(tile.pct);

                  const showSymbol = tw > 24 && th > 12;
                  const showPct = tw > 30 && th > 24;
                  const large = tw > 55 && th > 36;

                  const symFontSize = large ? Math.min(tw / 4.5, 20) : Math.min(tw / 5, 11);
                  const pctFontSize = large ? 11 : 8;
                  const midY = ty + th / 2;
                  const symY = showPct
                    ? midY - (large ? 8 : 5) + (large ? 0 : 1)
                    : midY + symFontSize * 0.38;
                  const pctY = midY + (large ? 12 : 7);

                  return (
                    // biome-ignore lint/a11y/useSemanticElements: SVG <g> cannot be replaced by <button>
                    <g
                      key={tile.symbol}
                      onClick={() => broadcast({ selectedAsset: tile.symbol })}
                      onMouseEnter={() => {
                        hovered.value = tile.symbol;
                      }}
                      onMouseLeave={() => {
                        hovered.value = null;
                      }}
                      style={{ cursor: "pointer" }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ")
                          broadcast({ selectedAsset: tile.symbol });
                      }}
                      aria-label={`${tile.symbol}: ${tile.pct >= 0 ? "+" : ""}${tile.pct.toFixed(2)}%`}
                    >
                      <rect
                        x={tx}
                        y={ty}
                        width={tw}
                        height={th}
                        fill={color}
                        stroke={isHovered ? "#f9fafb" : "#00000030"}
                        strokeWidth={isHovered ? 1.5 : 0.5}
                        rx={1}
                      />

                      {showSymbol && (
                        <text
                          x={tx + tw / 2}
                          y={symY}
                          textAnchor="middle"
                          fontSize={symFontSize}
                          fontWeight="700"
                          fill={tileTextColor(tile.pct)}
                          style={{ pointerEvents: "none" }}
                        >
                          {tile.symbol}
                        </text>
                      )}

                      {showPct && (
                        <text
                          x={tx + tw / 2}
                          y={pctY}
                          textAnchor="middle"
                          fontSize={pctFontSize}
                          fontWeight="500"
                          fill={tileTextColor(tile.pct)}
                          style={{ pointerEvents: "none" }}
                        >
                          {tile.pct >= 0 ? "+" : ""}
                          {tile.pct.toFixed(2)}%
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>

        {/* Hover tooltip */}
        {hovered.value &&
          (() => {
            const tile = tiles.find((t) => t.symbol === hovered.value);
            if (!tile) return null;
            return (
              <div
                className="absolute top-2 right-2 bg-gray-900/95 border border-gray-700 rounded shadow-xl px-3 py-2 text-[11px] pointer-events-none z-10 min-w-[110px]"
                aria-live="polite"
              >
                <div className="font-bold text-gray-100 text-sm mb-0.5">{tile.symbol}</div>
                <div className="text-gray-500 text-[10px] mb-1">{tile.sector}</div>
                <div
                  className={`font-bold text-base ${tile.pct >= 0 ? "text-emerald-400" : "text-red-400"}`}
                >
                  {tile.pct >= 0 ? "+" : ""}
                  {tile.pct.toFixed(2)}%
                </div>
                <div className="text-gray-600 text-[9px] mt-1.5 border-t border-gray-800 pt-1">
                  Click to broadcast →
                </div>
              </div>
            );
          })()}
      </div>
    </div>
  );
}

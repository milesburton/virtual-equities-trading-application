import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
// react-grid-layout uses `export = X` CJS types; import as default and cast to avoid
// type gymnastics — `skipLibCheck: true` and the any-cast keep TS happy.
import GridLayoutLib, { noCompactor } from "react-grid-layout";

// biome-ignore lint/suspicious/noExplicitAny: third-party library workaround
const GridLayout = (GridLayoutLib as any).default ?? GridLayoutLib;

import { ChannelContext } from "../contexts/ChannelContext.tsx";
import type { ChannelNumber } from "../store/channelsSlice.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { setSelectedAsset } from "../store/uiSlice.ts";
import { AdminPanel } from "./AdminPanel.tsx";
import { AlgoMonitor } from "./AlgoMonitor.tsx";
import { CandlestickChart } from "./CandlestickChart.tsx";
import { MarketDepth } from "./MarketDepth.tsx";
import { MarketLadder } from "./MarketLadder.tsx";
import { ObservabilityPanel } from "./ObservabilityPanel.tsx";
import { OrderBlotter } from "./OrderBlotter.tsx";
import { OrderTicket } from "./OrderTicket.tsx";

// ─── Channel constants ─────────────────────────────────────────────────────────

export type { ChannelNumber };

export const CHANNEL_COLOURS: Record<ChannelNumber, { hex: string; tw: string; label: string }> = {
  1: { hex: "#3b82f6", tw: "blue", label: "Blue" },
  2: { hex: "#22c55e", tw: "green", label: "Green" },
  3: { hex: "#eab308", tw: "yellow", label: "Yellow" },
  4: { hex: "#ef4444", tw: "red", label: "Red" },
  5: { hex: "#a855f7", tw: "purple", label: "Purple" },
  6: { hex: "#f97316", tw: "orange", label: "Orange" },
};

// ─── Panel registry ────────────────────────────────────────────────────────────

export const PANEL_IDS = [
  "market-ladder",
  "order-ticket",
  "order-blotter",
  "algo-monitor",
  "observability",
  "candle-chart",
  "market-depth",
  "admin",
] as const;

export type PanelId = (typeof PANEL_IDS)[number];

export const PANEL_TITLES: Record<PanelId, string> = {
  "market-ladder": "Market Ladder",
  "order-ticket": "Order Ticket",
  "order-blotter": "Order Blotter",
  "algo-monitor": "Algo Monitor",
  observability: "Observability",
  "candle-chart": "Chart",
  "market-depth": "Market Depth",
  admin: "Admin",
};

/** Which channels each panel type supports */
export const PANEL_CHANNEL_CAPS: Record<PanelId, { out: boolean; in: boolean }> = {
  "market-ladder": { out: true, in: false },
  "order-ticket": { out: false, in: true },
  "candle-chart": { out: false, in: true },
  "market-depth": { out: false, in: true },
  "order-blotter": { out: true, in: false },
  "algo-monitor": { out: false, in: true },
  observability: { out: false, in: false },
  admin: { out: false, in: false },
};

// ─── Layout item ───────────────────────────────────────────────────────────────

export interface LayoutItem {
  i: string; // unique instance ID, e.g. "market-ladder-1"
  panelType: PanelId; // which component to render
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
  static?: boolean;
  isDraggable?: boolean;
  isResizable?: boolean;
  outgoing?: ChannelNumber; // channel this instance broadcasts on
  incoming?: ChannelNumber; // channel this instance listens to
}

export const DEFAULT_LAYOUT: LayoutItem[] = [
  {
    i: "order-ticket",
    panelType: "order-ticket",
    x: 0,
    y: 0,
    w: 2,
    h: 14,
    minW: 2,
    minH: 8,
    incoming: 1,
  },
  {
    i: "market-ladder",
    panelType: "market-ladder",
    x: 2,
    y: 0,
    w: 3,
    h: 14,
    minW: 2,
    minH: 6,
    outgoing: 1,
  },
  {
    i: "candle-chart",
    panelType: "candle-chart",
    x: 5,
    y: 0,
    w: 4,
    h: 10,
    minW: 3,
    minH: 4,
    incoming: 1,
  },
  {
    i: "market-depth",
    panelType: "market-depth",
    x: 9,
    y: 0,
    w: 3,
    h: 10,
    minW: 2,
    minH: 4,
    incoming: 1,
  },
  {
    i: "algo-monitor",
    panelType: "algo-monitor",
    x: 5,
    y: 10,
    w: 4,
    h: 4,
    minW: 3,
    minH: 3,
    incoming: 1,
  },
  { i: "observability", panelType: "observability", x: 9, y: 10, w: 3, h: 4, minW: 2, minH: 3 },
  { i: "order-blotter", panelType: "order-blotter", x: 0, y: 14, w: 12, h: 4, minW: 4, minH: 3 },
];

export const LAYOUT_TEMPLATES: {
  id: string;
  label: string;
  description: string;
  layout: LayoutItem[];
}[] = [
  {
    id: "full",
    label: "Full Dashboard",
    description: "All panels — complete trading view",
    layout: DEFAULT_LAYOUT,
  },
  {
    id: "execution",
    label: "Execution",
    description: "Order entry, ladder, and blotter",
    layout: [
      {
        i: "order-ticket",
        panelType: "order-ticket",
        x: 0,
        y: 0,
        w: 3,
        h: 14,
        minW: 2,
        minH: 8,
        incoming: 1,
      },
      {
        i: "market-ladder",
        panelType: "market-ladder",
        x: 3,
        y: 0,
        w: 5,
        h: 14,
        minW: 2,
        minH: 6,
        outgoing: 1,
      },
      {
        i: "order-blotter",
        panelType: "order-blotter",
        x: 0,
        y: 14,
        w: 12,
        h: 4,
        minW: 4,
        minH: 3,
      },
    ],
  },
  {
    id: "algo",
    label: "Algo Trading",
    description: "Algorithm monitor, chart, and blotter",
    layout: [
      {
        i: "candle-chart",
        panelType: "candle-chart",
        x: 0,
        y: 0,
        w: 7,
        h: 10,
        minW: 3,
        minH: 4,
        incoming: 1,
      },
      {
        i: "market-depth",
        panelType: "market-depth",
        x: 7,
        y: 0,
        w: 5,
        h: 10,
        minW: 2,
        minH: 4,
        incoming: 1,
      },
      {
        i: "algo-monitor",
        panelType: "algo-monitor",
        x: 0,
        y: 10,
        w: 7,
        h: 4,
        minW: 3,
        minH: 3,
        incoming: 1,
      },
      {
        i: "order-blotter",
        panelType: "order-blotter",
        x: 0,
        y: 14,
        w: 12,
        h: 4,
        minW: 4,
        minH: 3,
      },
    ],
  },
  {
    id: "analysis",
    label: "Market Analysis",
    description: "Chart, depth, and ladder — no order entry",
    layout: [
      {
        i: "market-ladder",
        panelType: "market-ladder",
        x: 0,
        y: 0,
        w: 3,
        h: 14,
        minW: 2,
        minH: 6,
        outgoing: 1,
      },
      {
        i: "candle-chart",
        panelType: "candle-chart",
        x: 3,
        y: 0,
        w: 6,
        h: 10,
        minW: 3,
        minH: 4,
        incoming: 1,
      },
      {
        i: "market-depth",
        panelType: "market-depth",
        x: 9,
        y: 0,
        w: 3,
        h: 10,
        minW: 2,
        minH: 4,
        incoming: 1,
      },
    ],
  },
];

export const STORAGE_KEY_PREFIX = "dashboard-layout";
export const STORAGE_KEY = STORAGE_KEY_PREFIX;

/** Bump when DEFAULT_LAYOUT changes — forces stale stored layouts to reset */
const LAYOUT_VERSION = 3;

/** Migrate old format (i === panelType, no panelType field) to LayoutItem */
function migrateItem(raw: Record<string, unknown>): LayoutItem {
  const panelType = (raw.panelType ?? raw.i) as PanelId;
  return {
    ...(raw as unknown as LayoutItem),
    panelType,
  };
}

function saveLayout(storageKey: string, items: LayoutItem[]) {
  localStorage.setItem(storageKey, JSON.stringify({ _v: LAYOUT_VERSION, items }));
}

function loadLayout(storageKey: string): LayoutItem[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Accept only versioned format with the current version
      if (!Array.isArray(parsed) && parsed._v === LAYOUT_VERSION && Array.isArray(parsed.items)) {
        return (parsed.items as Record<string, unknown>[]).map(migrateItem);
      }
      // Unversioned (plain array) or wrong version — fall through to reset
    }
  } catch {
    // corrupted — fall through to default
  }
  return DEFAULT_LAYOUT;
}

// ─── Cycle detection ───────────────────────────────────────────────────────────

/**
 * Returns true if assigning outgoing=N to `instanceId` would create a cycle.
 */
export function wouldCreateCycleOut(
  N: ChannelNumber,
  instanceId: string,
  allItems: LayoutItem[]
): boolean {
  const myIncoming = allItems.find((i) => i.i === instanceId)?.incoming ?? null;
  if (myIncoming === null) return false;

  const visited = new Set<string>();
  const queue = allItems.filter((i) => i.incoming === N).map((i) => i.i);

  while (queue.length > 0) {
    const cur = queue.shift() as string;
    if (cur === instanceId) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const item = allItems.find((i) => i.i === cur);
    if (item?.outgoing != null) {
      queue.push(...allItems.filter((i) => i.incoming === item.outgoing).map((i) => i.i));
    }
  }
  return false;
}

/**
 * Returns true if assigning incoming=N to `instanceId` would create a cycle.
 */
export function wouldCreateCycleIn(
  N: ChannelNumber,
  instanceId: string,
  allItems: LayoutItem[]
): boolean {
  const myOutgoing = allItems.find((i) => i.i === instanceId)?.outgoing ?? null;
  if (myOutgoing === null) return false;

  if (myOutgoing === N) return true;

  const visited = new Set<ChannelNumber>();
  const channelQueue: ChannelNumber[] = [myOutgoing];

  while (channelQueue.length > 0) {
    const ch = channelQueue.shift() as ChannelNumber;
    if (visited.has(ch)) continue;
    visited.add(ch);
    for (const item of allItems) {
      if (item.incoming === ch && item.outgoing != null) {
        if (item.outgoing === N) return true;
        channelQueue.push(item.outgoing);
      }
    }
  }
  return false;
}

// ─── Smart panel placement ────────────────────────────────────────────────────

function findOpenSpot(layout: LayoutItem[], w: number, h: number): { x: number; y: number } {
  const occupied = new Set<string>();
  for (const item of layout) {
    for (let row = item.y; row < item.y + item.h; row++) {
      for (let col = item.x; col < item.x + item.w; col++) {
        occupied.add(`${col},${row}`);
      }
    }
  }
  const maxRow = layout.length > 0 ? Math.max(...layout.map((it) => it.y + it.h)) : 0;
  for (let row = 0; row <= maxRow; row++) {
    for (let col = 0; col <= 12 - w; col++) {
      let fits = true;
      outer: for (let dr = 0; dr < h; dr++) {
        for (let dc = 0; dc < w; dc++) {
          if (occupied.has(`${col + dc},${row + dr}`)) {
            fits = false;
            break outer;
          }
        }
      }
      if (fits) return { x: col, y: row };
    }
  }
  // No gap found — append at bottom
  return { x: 0, y: maxRow };
}

// ─── Context ──────────────────────────────────────────────────────────────────

export interface DashboardContextValue {
  layout: LayoutItem[];
  setLayout: (next: LayoutItem[] | ((prev: LayoutItem[]) => LayoutItem[])) => void;
  activePanelIds: Set<PanelId>;
  addPanel: (id: PanelId) => void;
  removePanel: (id: PanelId) => void;
  resetLayout: (templateLayout?: LayoutItem[]) => void;
  storageKey: string;
}

export const DashboardContext = createContext<DashboardContextValue>({
  layout: DEFAULT_LAYOUT,
  setLayout: () => {},
  activePanelIds: new Set(),
  addPanel: () => {},
  removePanel: () => {},
  resetLayout: (_layout?) => {},
  storageKey: STORAGE_KEY,
});

export function useDashboard() {
  return useContext(DashboardContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

interface DashboardProviderProps {
  children: ReactNode;
  storageKey?: string;
}

export function DashboardProvider({ children, storageKey = STORAGE_KEY }: DashboardProviderProps) {
  const [layout, setLayoutState] = useState<LayoutItem[]>(() => loadLayout(storageKey));

  const activePanelIds = new Set(layout.map((l) => l.panelType));

  const setLayout = useCallback((next: LayoutItem[] | ((prev: LayoutItem[]) => LayoutItem[])) => {
    setLayoutState(next);
  }, []);

  const addPanel = useCallback(
    (panelType: PanelId) => {
      setLayoutState((prev) => {
        const instanceId = `${panelType}-${Date.now()}`;
        const w = 4;
        const h = 6;
        const { x, y } = findOpenSpot(prev, w, h);
        const next: LayoutItem[] = [
          ...prev,
          { i: instanceId, panelType, x, y, w, h, minW: 2, minH: 3 },
        ];
        saveLayout(storageKey, next);
        return next;
      });
    },
    [storageKey]
  );

  const removePanel = useCallback(
    (panelType: PanelId) => {
      setLayoutState((prev) => {
        const idx = prev.findIndex((l) => l.panelType === panelType);
        if (idx === -1) return prev;
        const next = prev.filter((_, i) => i !== idx);
        saveLayout(storageKey, next);
        return next;
      });
    },
    [storageKey]
  );

  const resetLayout = useCallback(
    (templateLayout?: LayoutItem[]) => {
      const next = templateLayout ?? DEFAULT_LAYOUT;
      saveLayout(storageKey, next);
      setLayoutState(next);
    },
    [storageKey]
  );

  return (
    <DashboardContext.Provider
      value={{ layout, setLayout, activePanelIds, addPanel, removePanel, resetLayout, storageKey }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

// ─── Channel dot + picker ─────────────────────────────────────────────────────

interface ChannelPickerProps {
  dir: "out" | "in";
  current: ChannelNumber | null;
  blockedChannels: Set<ChannelNumber>;
  onPick: (ch: ChannelNumber | null) => void;
}

function ChannelPicker({ dir, current, blockedChannels, onPick }: ChannelPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const colour = current !== null ? CHANNEL_COLOURS[current] : null;
  const isOut = dir === "out";
  const arrow = isOut ? "→" : "←";
  const dirLabel = isOut ? "Broadcast channel" : "Listen channel";
  const buttonTitle = colour
    ? `${dirLabel}: ${colour.label} — click to change`
    : `${dirLabel}: not set — click to connect`;

  return (
    <div ref={ref} className="relative flex items-center gap-0.5">
      <button
        type="button"
        title={buttonTitle}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors text-[9px] font-medium leading-none ${
          colour
            ? "hover:bg-gray-700/60"
            : "hover:bg-gray-700/40 border border-dashed border-gray-700 hover:border-gray-500"
        }`}
      >
        <span className={colour ? "text-gray-400" : "text-gray-600"}>{arrow}</span>
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0 border"
          style={{
            backgroundColor: colour ? colour.hex : "transparent",
            borderColor: colour ? colour.hex : "#4b5563",
          }}
        />
        {colour && (
          <span style={{ color: colour.hex }} className="hidden sm:inline">
            {colour.label}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-0.5 z-50 bg-gray-900 border border-gray-700 rounded shadow-xl p-1.5 flex flex-col gap-0.5 min-w-[110px]">
          <span className="text-[9px] text-gray-500 px-1 pb-0.5">{dirLabel}</span>
          {([1, 2, 3, 4, 5, 6] as ChannelNumber[]).map((n) => {
            const col = CHANNEL_COLOURS[n];
            const blocked = blockedChannels.has(n);
            return (
              <button
                key={n}
                type="button"
                disabled={blocked}
                title={blocked ? "Would create a cycle" : col.label}
                onClick={() => {
                  onPick(n);
                  setOpen(false);
                }}
                className={`flex items-center gap-1.5 px-1.5 py-1 rounded text-[10px] transition-colors text-left ${
                  current === n
                    ? "bg-gray-700 text-gray-100"
                    : blocked
                      ? "text-gray-700 cursor-not-allowed"
                      : "text-gray-300 hover:bg-gray-800"
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: blocked ? "#374151" : col.hex,
                  }}
                />
                <span>{col.label}</span>
                {blocked && <span className="ml-auto text-gray-700">⊘</span>}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              onPick(null);
              setOpen(false);
            }}
            className="flex items-center gap-1.5 px-1.5 py-1 rounded text-[10px] text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors"
          >
            None
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Panel chrome ─────────────────────────────────────────────────────────────

interface PanelChromeProps {
  id: string;
  panelType: PanelId;
  title: string;
  outgoing: ChannelNumber | null;
  incoming: ChannelNumber | null;
  allItems: LayoutItem[];
  onRemove: (instanceId: string) => void;
  onChannelChange: (instanceId: string, dir: "out" | "in", ch: ChannelNumber | null) => void;
  children: React.ReactNode;
}

function PanelChrome({
  id,
  panelType,
  title,
  outgoing,
  incoming,
  allItems,
  onRemove,
  onChannelChange,
  children,
}: PanelChromeProps) {
  const caps = PANEL_CHANNEL_CAPS[panelType];

  const blockedOut = new Set<ChannelNumber>(
    ([1, 2, 3, 4, 5, 6] as ChannelNumber[]).filter((n) => wouldCreateCycleOut(n, id, allItems))
  );
  const blockedIn = new Set<ChannelNumber>(
    ([1, 2, 3, 4, 5, 6] as ChannelNumber[]).filter((n) => wouldCreateCycleIn(n, id, allItems))
  );

  return (
    <div
      className="flex flex-col h-full bg-gray-950 border border-gray-800 rounded overflow-hidden"
      onMouseDownCapture={(e) => {
        const target = e.target as HTMLElement;
        if (!target.closest("button, a, [role='button'], [tabindex]")) return;
        if (target.closest("input, textarea, select, [contenteditable='true']")) return;
        e.preventDefault();
      }}
    >
      <div className="panel-drag-handle px-2 py-1 border-b border-gray-800 flex items-center gap-1.5 cursor-grab select-none shrink-0 bg-gray-900/60">
        {caps.out && (
          <ChannelPicker
            dir="out"
            current={outgoing}
            blockedChannels={blockedOut}
            onPick={(ch) => onChannelChange(id, "out", ch)}
          />
        )}

        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex-1 truncate">
          {title}
        </span>

        {caps.in && (
          <ChannelPicker
            dir="in"
            current={incoming}
            blockedChannels={blockedIn}
            onPick={(ch) => onChannelChange(id, "in", ch)}
          />
        )}

        <button
          type="button"
          aria-label={`Close ${title}`}
          onClick={() => onRemove(id)}
          className="text-gray-600 hover:text-gray-300 transition-colors text-xs leading-none ml-1 shrink-0"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-hidden min-h-0">{children}</div>
    </div>
  );
}

// ─── Grid component ───────────────────────────────────────────────────────────

export function DashboardLayout() {
  const dispatch = useAppDispatch();
  const legacySelectedAsset = useAppSelector((s) => s.ui.selectedAsset);
  const candleHistory = useAppSelector((s) => s.market.candleHistory);
  const { layout, setLayout, storageKey } = useDashboard();

  const containerRef = useRef<HTMLDivElement>(null);
  // deno-lint-ignore no-window
  const [gridWidth, setGridWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1200
  );

  // liveLayout mirrors `layout` exactly. It is only updated when the item
  // set changes (panel added/removed/reset) or when a drag/resize completes.
  // RGL manages its own in-drag position state internally.
  const prevItemKeys = useRef(
    layout
      .map((l) => l.i)
      .sort()
      .join(",")
  );
  const [liveLayout, setLiveLayout] = useState(layout);

  const nextItemKeys = layout
    .map((l) => l.i)
    .sort()
    .join(",");
  if (prevItemKeys.current !== nextItemKeys) {
    prevItemKeys.current = nextItemKeys;
    setLiveLayout(layout);
  }

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      setGridWidth(entries[0].contentRect.width);
    });
    ro.observe(containerRef.current);
    setGridWidth(containerRef.current.clientWidth);
    return () => ro.disconnect();
  }, []);

  const applyGridPositions = useCallback(
    (newLayout: { i: string; x: number; y: number; w: number; h: number }[]) => {
      setLiveLayout((prev) => {
        const next = prev.map((item) => {
          const updated = newLayout.find((l) => l.i === item.i);
          return updated ? { ...item, ...updated } : item;
        });
        saveLayout(storageKey, next);
        setLayout(next);
        return next;
      });
    },
    [storageKey, setLayout]
  );

  function removeByInstanceId(instanceId: string) {
    const next = layout.filter((l) => l.i !== instanceId);
    saveLayout(storageKey, next);
    setLayout(next);
  }

  function handleChannelChange(instanceId: string, dir: "out" | "in", ch: ChannelNumber | null) {
    const next = layout.map((item) => {
      if (item.i !== instanceId) return item;
      const updated = { ...item };
      if (dir === "out") {
        if (ch === null) delete updated.outgoing;
        else updated.outgoing = ch;
      } else {
        if (ch === null) delete updated.incoming;
        else updated.incoming = ch;
      }
      return updated;
    });
    saveLayout(storageKey, next);
    setLayout(next);
  }

  function renderPanelContent(item: LayoutItem): React.ReactNode {
    const { panelType, i: instanceId, outgoing, incoming } = item;
    const ctx = {
      instanceId,
      panelType,
      outgoing: outgoing ?? null,
      incoming: incoming ?? null,
    };

    function wrap(node: React.ReactNode) {
      return <ChannelContext.Provider value={ctx}>{node}</ChannelContext.Provider>;
    }

    switch (panelType) {
      case "market-ladder":
        return wrap(<MarketLadder />);
      case "order-ticket":
        return wrap(<OrderTicket />);
      case "order-blotter":
        return wrap(<OrderBlotter />);
      case "algo-monitor":
        return wrap(<AlgoMonitor />);
      case "observability":
        return wrap(<ObservabilityPanel />);
      case "candle-chart":
        return wrap(
          <div className="flex flex-col h-full">
            {legacySelectedAsset && candleHistory[legacySelectedAsset] ? (
              <CandlestickChart
                symbol={legacySelectedAsset}
                candles={candleHistory[legacySelectedAsset]}
                onClose={() => dispatch(setSelectedAsset(null))}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-600 text-xs gap-2 bg-gradient-to-br from-gray-900 to-gray-950">
                <div className="w-12 h-12 rounded-full border-2 border-gray-700 flex items-center justify-center">
                  📊
                </div>
                <div className="text-center max-w-xs">
                  <div className="font-medium text-gray-400 mb-1">Select an Asset</div>
                  <div>
                    Click a stock in the <span className="text-emerald-400">Market Ladder</span> to
                    view its candlestick chart
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      case "market-depth":
        return wrap(
          <div className="flex flex-col h-full">
            {legacySelectedAsset ? (
              <MarketDepth symbol={legacySelectedAsset} />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-600 text-xs bg-gradient-to-br from-gray-900 to-gray-950">
                <div className="text-center">Select an asset in Market Ladder</div>
              </div>
            )}
          </div>
        );
      case "admin":
        return wrap(<AdminPanel />);
    }
  }

  // react-grid-layout's types don't fully match its runtime API; cast at the boundary.
  // biome-ignore lint/suspicious/noExplicitAny: untyped third-party props
  const gridLayout = liveLayout as any;
  // biome-ignore lint/suspicious/noExplicitAny: untyped third-party callback signature
  const gridOnStop = applyGridPositions as any;

  return (
    <div ref={containerRef} className="w-full">
      <GridLayout
        layout={gridLayout}
        cols={12}
        rowHeight={50}
        margin={[4, 4]}
        containerPadding={[4, 4]}
        draggableHandle=".panel-drag-handle"
        onDragStop={gridOnStop}
        onResizeStop={gridOnStop}
        resizeHandles={["se"]}
        width={gridWidth}
        compactor={noCompactor}
      >
        {liveLayout.map((item) => (
          <div key={item.i} className="grid-item-wrapper">
            <PanelChrome
              id={item.i}
              panelType={item.panelType}
              title={PANEL_TITLES[item.panelType] ?? item.panelType}
              outgoing={item.outgoing ?? null}
              incoming={item.incoming ?? null}
              allItems={liveLayout}
              onRemove={removeByInstanceId}
              onChannelChange={handleChannelChange}
            >
              {renderPanelContent(item)}
            </PanelChrome>
          </div>
        ))}
      </GridLayout>
    </div>
  );
}

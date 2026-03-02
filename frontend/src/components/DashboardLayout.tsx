import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
// react-grid-layout uses `export = X` CJS types; import as default and cast to avoid
// type gymnastics — `skipLibCheck: true` and the any-cast keep TS happy.
// @ts-expect-error - third-party library CJS types
import GridLayoutLib from "react-grid-layout";

// deno-lint-ignore no-explicit-any - third-party library workaround
const GridLayout = (GridLayoutLib as any).default ?? GridLayoutLib;

import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { setSelectedAsset } from "../store/uiSlice.ts";
import { AlgoMonitor } from "./AlgoMonitor.tsx";
import { CandlestickChart } from "./CandlestickChart.tsx";
import { MarketDepth } from "./MarketDepth.tsx";
import { MarketLadder } from "./MarketLadder.tsx";
import { ObservabilityPanel } from "./ObservabilityPanel.tsx";
import { OrderBlotter } from "./OrderBlotter.tsx";
import { OrderTicket } from "./OrderTicket.tsx";

// react-grid-layout's @types uses `export = ReactGridLayout` which means
// the Layout interface lives on the namespace. We pull it out here for convenience.
type Layout = {
  i: string;
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
};

export const PANEL_IDS = [
  "market-ladder",
  "order-ticket",
  "order-blotter",
  "algo-monitor",
  "observability",
  "candle-chart",
  "market-depth",
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
};

export const DEFAULT_LAYOUT: Layout[] = [
  { i: "order-ticket", x: 0, y: 0, w: 3, h: 16, minW: 2, minH: 8 },
  { i: "order-blotter", x: 3, y: 0, w: 9, h: 8, minW: 3, minH: 3 },
  { i: "algo-monitor", x: 3, y: 8, w: 6, h: 8, minW: 3, minH: 3 },
  { i: "observability", x: 9, y: 8, w: 3, h: 8, minW: 2, minH: 3 },
];

export const STORAGE_KEY_PREFIX = "dashboard-layout";
/** Kept for backwards-compat and tests that don't pass a storageKey. */
export const STORAGE_KEY = STORAGE_KEY_PREFIX;

function loadLayout(storageKey: string): Layout[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) return JSON.parse(raw) as Layout[];
  } catch {
    // corrupted — fall through to default
  }
  return DEFAULT_LAYOUT;
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface DashboardContextValue {
  activePanelIds: Set<PanelId>;
  addPanel: (id: PanelId) => void;
  removePanel: (id: PanelId) => void;
  resetLayout: () => void;
  storageKey: string;
}

export const DashboardContext = createContext<DashboardContextValue>({
  activePanelIds: new Set(),
  addPanel: () => {},
  removePanel: () => {},
  resetLayout: () => {},
  storageKey: STORAGE_KEY,
});

export function useDashboard() {
  return useContext(DashboardContext);
}

// ─── Provider (lifted above StatusBar so ComponentPicker can consume it) ──────

interface DashboardProviderProps {
  children: ReactNode;
  /** localStorage key for this workspace's layout. Defaults to "dashboard-layout". */
  storageKey?: string;
}

export function DashboardProvider({ children, storageKey = STORAGE_KEY }: DashboardProviderProps) {
  const [layout, setLayout] = useState<Layout[]>(() => loadLayout(storageKey));

  const activePanelIds = new Set(layout.map((l) => l.i as PanelId));

  const addPanel = useCallback(
    (id: PanelId) => {
      setLayout((prev) => {
        if (prev.some((l) => l.i === id)) return prev;
        const next: Layout[] = [
          ...prev,
          { i: id, x: 0, y: Infinity, w: 4, h: 6, minW: 2, minH: 3 },
        ];
        localStorage.setItem(storageKey, JSON.stringify(next));
        return next;
      });
    },
    [storageKey]
  );

  const removePanel = useCallback(
    (id: PanelId) => {
      setLayout((prev) => {
        const next = prev.filter((l) => l.i !== id);
        localStorage.setItem(storageKey, JSON.stringify(next));
        return next;
      });
    },
    [storageKey]
  );

  const resetLayout = useCallback(() => {
    localStorage.removeItem(storageKey);
    setLayout(DEFAULT_LAYOUT);
  }, [storageKey]);

  return (
    <DashboardContext.Provider
      value={{ activePanelIds, addPanel, removePanel, resetLayout, storageKey }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

// ─── Panel chrome ─────────────────────────────────────────────────────────────

interface PanelChromeProps {
  id: PanelId;
  title: string;
  onRemove: (id: PanelId) => void;
  children: React.ReactNode;
}

function PanelChrome({ id, title, onRemove, children }: PanelChromeProps) {
  return (
    <div className="flex flex-col h-full bg-gray-950 border border-gray-800 rounded overflow-hidden">
      <div className="panel-drag-handle px-3 py-1.5 border-b border-gray-800 flex items-center justify-between cursor-grab select-none shrink-0 bg-gray-900/60">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
          {title}
        </span>
        <button
          type="button"
          aria-label={`Close ${title}`}
          onClick={() => onRemove(id)}
          className="text-gray-700 hover:text-gray-400 transition-colors text-xs leading-none"
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
  const selectedAsset = useAppSelector((s) => s.ui.selectedAsset);
  const candleHistory = useAppSelector((s) => s.market.candleHistory);
  const {
    activePanelIds,
    addPanel: _add,
    removePanel,
    resetLayout: _reset,
    storageKey,
  } = useDashboard();

  // Keep a local copy of the layout for the grid (synced from context via activePanelIds changes)
  const [layout, setLayout] = useState<Layout[]>(() => loadLayout(storageKey));
  const containerRef = useRef<HTMLDivElement>(null);
  // deno-lint-ignore no-window
  const [gridWidth, setGridWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1200
  );

  // Re-sync grid layout when panels are added/removed from context
  useEffect(() => {
    setLayout((prev) => {
      const saved = (() => {
        try {
          const raw = localStorage.getItem(storageKey);
          return raw ? (JSON.parse(raw) as Layout[]) : DEFAULT_LAYOUT;
        } catch {
          return DEFAULT_LAYOUT;
        }
      })();
      // Keep saved positions for existing panels; add new ones at bottom
      const result: Layout[] = [];
      for (const id of activePanelIds) {
        const existing = saved.find((l) => l.i === id) ?? prev.find((l) => l.i === id);
        if (existing) {
          result.push(existing);
        } else {
          result.push({ i: id, x: 0, y: Infinity, w: 4, h: 6, minW: 2, minH: 3 });
        }
      }
      return result;
    });
  }, [activePanelIds, storageKey]);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      setGridWidth(entries[0].contentRect.width);
    });
    ro.observe(containerRef.current);
    setGridWidth(containerRef.current.clientWidth);
    return () => ro.disconnect();
  }, []);

  const handleLayoutChange = useCallback(
    (newLayout: Layout[]) => {
      setLayout(newLayout);
      localStorage.setItem(storageKey, JSON.stringify(newLayout));
    },
    [storageKey]
  );

  function renderPanelContent(id: PanelId): React.ReactNode {
    switch (id) {
      case "market-ladder":
        return <MarketLadder />;
      case "order-ticket":
        return <OrderTicket />;
      case "order-blotter":
        return <OrderBlotter />;
      case "algo-monitor":
        return <AlgoMonitor />;
      case "observability":
        return <ObservabilityPanel />;
      case "candle-chart":
        return selectedAsset && candleHistory[selectedAsset] ? (
          <CandlestickChart
            symbol={selectedAsset}
            candles={candleHistory[selectedAsset]}
            onClose={() => dispatch(setSelectedAsset(null))}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-600 text-xs">
            Click an asset in the Market Ladder to open a chart
          </div>
        );
      case "market-depth":
        return selectedAsset ? (
          <MarketDepth symbol={selectedAsset} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-600 text-xs">
            Select an asset in the Market Ladder
          </div>
        );
    }
  }

  return (
    <div ref={containerRef} className="w-full">
      {/* deno-lint-ignore no-explicit-any - third-party library workaround */}
      {/* biome-ignore lint/suspicious/noExplicitAny lint/a11y/noStaticElementInteractions: third-party library workaround */}
      <GridLayout
        layout={layout as any}
        cols={12}
        rowHeight={50}
        margin={[4, 4]}
        containerPadding={[4, 4]}
        draggableHandle=".panel-drag-handle"
        onLayoutChange={handleLayoutChange as any}
        resizeHandles={["se"]}
        width={gridWidth}
      >
        {layout.map((item) => (
          <div key={item.i}>
            <PanelChrome
              id={item.i as PanelId}
              title={PANEL_TITLES[item.i as PanelId] ?? item.i}
              onRemove={removePanel}
            >
              {renderPanelContent(item.i as PanelId)}
            </PanelChrome>
          </div>
        ))}
      </GridLayout>
    </div>
  );
}

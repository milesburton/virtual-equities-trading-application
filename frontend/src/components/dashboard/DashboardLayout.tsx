import type { BorderNode, IJsonModel, IJsonTabNode, TabNode, TabSetNode } from "flexlayout-react";
import { Actions, Layout, Model } from "flexlayout-react";
import type React from "react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "flexlayout-react/style/dark.css";
import { useSignal } from "@preact/signals-react";
import { ChannelContext } from "../../contexts/ChannelContext.tsx";
import type { ChannelNumber } from "../../store/channelsSlice.ts";
import { useAppDispatch, useAppSelector } from "../../store/hooks.ts";
import {
  panelClosed,
  panelDialogClosed,
  panelDialogOpened,
  panelPopped,
} from "../../store/windowSlice.ts";
import { AdminPanel } from "../AdminPanel.tsx";
import { AlgoMonitor } from "../AlgoMonitor.tsx";
import { AnalysisPanel } from "../AnalysisPanel.tsx";
import { CandlestickChart } from "../CandlestickChart.tsx";
import type { ContextMenuEntry } from "../ContextMenu.tsx";
import { ContextMenu } from "../ContextMenu.tsx";
import { DecisionLog } from "../DecisionLog.tsx";
import { ExecutionsPanel } from "../ExecutionsPanel.tsx";
import { MarketDepth } from "../MarketDepth.tsx";
import { MarketHeatmap } from "../MarketHeatmap.tsx";
import { MarketLadder } from "../MarketLadder.tsx";
import { MarketMatch } from "../MarketMatch.tsx";
import { NewsSourcesPanel } from "../NewsSourcesPanel.tsx";
import { ObservabilityPanel } from "../ObservabilityPanel.tsx";
import { OrderBlotter } from "../OrderBlotter.tsx";
import { OrderProgressPanel } from "../OrderProgressPanel.tsx";
import { OrderTicket } from "../OrderTicket.tsx";
import { clearDraggedPanelId, draggedPanelId } from "../panelDragState.ts";
import { DashboardContext, useDashboard } from "./DashboardContext.tsx";
import type { LayoutItem } from "./layoutUtils.ts";
import { wouldCreateCycleIn, wouldCreateCycleOut } from "./layoutUtils.ts";
import type { PanelId, TabChannelConfig } from "./panelRegistry.ts";
import {
  CHANNEL_COLOURS,
  PANEL_CHANNEL_CAPS,
  PANEL_DESCRIPTIONS,
  PANEL_IDS,
  PANEL_TITLES,
  SINGLETON_PANELS,
} from "./panelRegistry.ts";

export { DashboardContext, useDashboard };

// ── ChannelPicker ────────────────────────────────────────────────────────────

interface ChannelPickerProps {
  dir: "out" | "in";
  current: ChannelNumber | null;
  blockedChannels: Set<ChannelNumber>;
  onPick: (ch: ChannelNumber | null) => void;
  disabled?: boolean;
  allItems?: LayoutItem[];
  instanceId?: string;
}

function ChannelPicker({
  dir,
  current,
  blockedChannels,
  onPick,
  disabled = false,
  allItems = [],
  instanceId,
}: ChannelPickerProps) {
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (
        btnRef.current &&
        !btnRef.current.closest("[data-channel-picker]")?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  function handleOpen() {
    if (disabled) return;
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen((o) => !o);
  }

  const colour = current !== null ? CHANNEL_COLOURS[current] : null;
  const isOut = dir === "out";
  const dirLabel = isOut ? "Broadcast" : "Listen";
  const disabledLabel = isOut ? "This panel cannot broadcast" : "This panel cannot listen";

  const connectedPanels =
    current !== null && allItems.length > 0
      ? allItems
          .filter((item) => {
            if (isOut) return item.incoming === current && item.i !== instanceId;
            return item.outgoing === current && item.i !== instanceId;
          })
          .map((item) => PANEL_TITLES[item.panelType] ?? item.panelType)
      : [];
  const connectedStr =
    connectedPanels.length > 0 ? ` · ${isOut ? "→" : "←"} ${connectedPanels.join(", ")}` : "";

  const buttonTitle = disabled
    ? disabledLabel
    : colour
      ? `${dirLabel} Ch ${current} ${colour.label}${connectedStr} — click to change`
      : `${dirLabel}: not set — click to connect`;

  const dropdown = open
    ? createPortal(
        <div
          data-channel-picker
          style={{ top: dropdownPos.top, left: dropdownPos.left }}
          className="fixed z-[9999] bg-gray-900 border border-gray-700 rounded shadow-xl p-1.5 flex flex-col gap-0.5 min-w-[110px]"
        >
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
                  style={{ backgroundColor: blocked ? "#374151" : col.hex }}
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
        </div>,
        document.body
      )
    : null;

  return (
    <div data-channel-picker className="relative flex items-center gap-0.5">
      <button
        ref={btnRef}
        type="button"
        title={buttonTitle}
        onClick={handleOpen}
        disabled={disabled}
        className={`flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors text-[9px] font-medium leading-none ${
          disabled
            ? "opacity-30 cursor-not-allowed text-gray-600"
            : colour
              ? "hover:bg-gray-700/60"
              : "text-gray-500 hover:bg-gray-700/40 border border-dashed border-gray-700/60 hover:border-gray-500 hover:text-gray-400"
        }`}
      >
        <span className={disabled ? "text-gray-700" : colour ? "text-gray-500" : "text-gray-600"}>
          {isOut ? "Out:" : "In:"}
        </span>
        {colour && !disabled ? (
          <>
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: colour.hex }}
            />
            <span className="font-mono tabular-nums" style={{ color: colour.hex }}>
              Ch {current}
            </span>
          </>
        ) : (
          <span className={disabled ? "text-gray-700 font-mono" : "font-mono text-gray-600"}>
            —
          </span>
        )}
      </button>
      {dropdown}
    </div>
  );
}

// ── tabChannelButtons ─────────────────────────────────────────────────────────

interface TabChannelButtonsProps {
  node: TabNode;
  allItems: LayoutItem[];
  onChannelChange: (instanceId: string, dir: "out" | "in", ch: ChannelNumber | null) => void;
}

function tabChannelButtons({
  node,
  allItems,
  onChannelChange,
}: TabChannelButtonsProps): ReactNode[] {
  const cfg = node.getConfig() as TabChannelConfig | undefined;
  const panelType = cfg?.panelType;
  if (!panelType) return [];

  const caps = PANEL_CHANNEL_CAPS[panelType];
  const outgoing = cfg?.outgoing ?? null;
  const incoming = cfg?.incoming ?? null;
  const instanceId = node.getId();

  const blockedOut = new Set<ChannelNumber>(
    caps.out
      ? ([1, 2, 3, 4, 5, 6] as ChannelNumber[]).filter((n) =>
          wouldCreateCycleOut(n, instanceId, allItems)
        )
      : ([1, 2, 3, 4, 5, 6] as ChannelNumber[])
  );
  const blockedIn = new Set<ChannelNumber>(
    caps.in
      ? ([1, 2, 3, 4, 5, 6] as ChannelNumber[]).filter((n) =>
          wouldCreateCycleIn(n, instanceId, allItems)
        )
      : ([1, 2, 3, 4, 5, 6] as ChannelNumber[])
  );

  return [
    <ChannelPicker
      key="out"
      dir="out"
      current={outgoing}
      blockedChannels={blockedOut}
      onPick={(ch) => onChannelChange(instanceId, "out", ch)}
      disabled={!caps.out}
      allItems={allItems}
      instanceId={instanceId}
    />,
    <ChannelPicker
      key="in"
      dir="in"
      current={incoming}
      blockedChannels={blockedIn}
      onPick={(ch) => onChannelChange(instanceId, "in", ch)}
      disabled={!caps.in}
      allItems={allItems}
      instanceId={instanceId}
    />,
  ];
}

// ── patchTabConfig ────────────────────────────────────────────────────────────

type AnyJsonNode = IJsonTabNode | IJsonModel["layout"] | { children?: AnyJsonNode[] };

function patchTabConfig(
  nodes: AnyJsonNode[],
  tabId: string,
  dir: "out" | "in",
  ch: ChannelNumber | null
): boolean {
  for (const node of nodes) {
    const n = node as IJsonTabNode & { children?: AnyJsonNode[] };
    if (n.id === tabId) {
      const prev = (n.config ?? {}) as TabChannelConfig;
      if (dir === "out") {
        n.config = ch !== null ? { ...prev, outgoing: ch } : { ...prev, outgoing: undefined };
      } else {
        n.config = ch !== null ? { ...prev, incoming: ch } : { ...prev, incoming: undefined };
      }
      return true;
    }
    if (n.children && patchTabConfig(n.children, tabId, dir, ch)) return true;
  }
  return false;
}

// ── PanelDialog ───────────────────────────────────────────────────────────────

const DIALOG_PANEL_MAP: Record<string, React.ComponentType<{ instanceId: string }>> = {
  "market-ladder": MarketLadder,
  "order-ticket": OrderTicket,
  "order-blotter": OrderBlotter,
  "algo-monitor": AlgoMonitor,
  observability: ObservabilityPanel,
  executions: ExecutionsPanel,
  "decision-log": DecisionLog,
  "market-match": MarketMatch,
  admin: AdminPanel,
  news: AnalysisPanel,
  "news-sources": NewsSourcesPanel,
  "order-progress": OrderProgressPanel,
  "market-heatmap": MarketHeatmap,
};

function PanelDialog({
  instanceId,
  panelType,
  onClose,
}: {
  instanceId: string;
  panelType: string;
  onClose: () => void;
}) {
  const DialogPanel = DIALOG_PANEL_MAP[panelType];
  const title = PANEL_TITLES[panelType as PanelId] ?? panelType;

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />
      <div
        className="relative z-10 bg-gray-950 border border-gray-700 rounded-lg shadow-2xl flex flex-col"
        style={{ width: "min(90vw, 1100px)", height: "min(85vh, 800px)" }}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 shrink-0">
          <span className="text-xs text-gray-400 font-medium">{title}</span>
          <button
            type="button"
            onClick={onClose}
            title="Close dialog (Escape)"
            aria-label="Close dialog"
            className="text-gray-500 hover:text-gray-200 transition-colors text-sm px-1"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <ChannelContext.Provider
            value={{
              instanceId,
              panelType: panelType as PanelId,
              outgoing: null,
              incoming: null,
            }}
          >
            <div className="h-full overflow-hidden bg-gray-950">
              {DialogPanel ? (
                <DialogPanel instanceId={instanceId} />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-600 text-xs">
                  Panel not available in dialog mode
                </div>
              )}
            </div>
          </ChannelContext.Provider>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── CandleChartPanel ──────────────────────────────────────────────────────────

function CandleChartPanel({ incoming }: { incoming: ChannelNumber | null }) {
  const legacySelectedAsset = useAppSelector((s) => s.ui.selectedAsset);
  const channelsData = useAppSelector((s) => s.channels.data);
  const symbol =
    incoming !== null
      ? (channelsData[incoming]?.selectedAsset ?? legacySelectedAsset)
      : legacySelectedAsset;
  const candles = useAppSelector((s) => (symbol ? s.market.candleHistory[symbol] : undefined));
  const ready = useAppSelector((s) => (symbol ? s.market.candlesReady[symbol] : false));
  const hasEnoughBars = candles && (candles["1m"].length >= 2 || candles["5m"].length >= 2);

  if (symbol && ready && hasEnoughBars) {
    return <CandlestickChart key={symbol} symbol={symbol} candles={candles} />;
  }
  return (
    <div className="flex flex-col items-center justify-center gap-3 h-full bg-gray-950">
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
      <span className="text-[11px] text-gray-600">Connecting to market…</span>
    </div>
  );
}

// ── DashboardLayout ───────────────────────────────────────────────────────────

export function DashboardLayout() {
  const legacySelectedAsset = useAppSelector((s) => s.ui.selectedAsset);
  const channelsData = useAppSelector((s) => s.channels.data);
  const dialogs = useAppSelector((s) => s.windows.dialogs);
  const { model, setModel, layout, removePanel, addPanel, activePanelIds, storageKey } =
    useDashboard();
  const dispatch = useAppDispatch();

  const tabCtxMenu = useSignal<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);

  // ── Drag-to-new-window ─────────────────────────────────────────────────────
  const draggedTabIdRef = useRef<string | null>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const btn = (e.target as Element).closest(".flexlayout__tab_button");
      if (!btn) {
        draggedTabIdRef.current = null;
        return;
      }
      const path = btn.getAttribute("data-layout-path");
      if (path) {
        const label = btn.querySelector(".flexlayout__tab_button_content")?.textContent?.trim();
        if (label) {
          let found: string | null = null;
          model.visitNodes((node) => {
            if (!found && node.getType() === "tab") {
              const t = node as TabNode;
              if (t.getName() === label || label.startsWith(t.getName())) {
                found = t.getId();
              }
            }
          });
          draggedTabIdRef.current = found;
        }
      }
    }

    function onMouseLeave(e: MouseEvent) {
      if (e.relatedTarget !== null) return;
      const isDragging = !!document.querySelector(".flexlayout__drag_rect");
      if (!isDragging || !draggedTabIdRef.current) return;

      const tabId = draggedTabIdRef.current;
      draggedTabIdRef.current = null;

      let tabNode: TabNode | null = null;
      model.visitNodes((node) => {
        if (!tabNode && node.getType() === "tab" && node.getId() === tabId) {
          tabNode = node as TabNode;
        }
      });
      if (!tabNode) return;

      const cfg = (tabNode as TabNode).getConfig() as TabChannelConfig | undefined;
      const panelType = cfg?.panelType ?? ((tabNode as TabNode).getComponent() as PanelId);
      const instanceId = (tabNode as TabNode).getId();
      const params = new URLSearchParams({
        panel: instanceId,
        type: panelType,
        layout: "dashboard-layout",
      });
      const url = `${window.location.origin}${window.location.pathname}?${params}`;
      window.open(url, `panel-${instanceId}`, "width=1200,height=700,resizable=yes");
    }

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mouseleave", onMouseLeave);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [model]);
  // ── End drag-to-new-window ─────────────────────────────────────────────────

  const handleChannelChange = useCallback(
    (instanceId: string, dir: "out" | "in", ch: ChannelNumber | null) => {
      const json = model.toJson() as IJsonModel & {
        borders?: { children: AnyJsonNode[] }[];
      };

      const allNodes: AnyJsonNode[] = [
        json.layout,
        ...(json.borders?.flatMap((b) => b.children) ?? []),
      ];
      patchTabConfig(allNodes, instanceId, dir, ch);

      setModel(Model.fromJson(json));
    },
    [model, setModel]
  );

  const factory = useCallback(
    (node: TabNode): ReactNode => {
      const cfg = node.getConfig() as TabChannelConfig | undefined;
      const panelType: PanelId = cfg?.panelType ?? (node.getComponent() as PanelId);
      const instanceId = node.getId();
      const outgoing: ChannelNumber | null = cfg?.outgoing ?? null;
      const incoming: ChannelNumber | null = cfg?.incoming ?? null;

      function wrap(content: ReactNode) {
        return (
          <ChannelContext.Provider value={{ instanceId, panelType, outgoing, incoming }}>
            <div className="h-full overflow-hidden bg-gray-950">{content}</div>
          </ChannelContext.Provider>
        );
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
          return wrap(<CandleChartPanel incoming={incoming} />);
        case "market-depth": {
          const depthSymbol =
            incoming !== null
              ? (channelsData[incoming]?.selectedAsset ?? legacySelectedAsset)
              : legacySelectedAsset;
          return wrap(
            <div className="flex flex-col h-full">
              {depthSymbol ? (
                <MarketDepth symbol={depthSymbol} />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-600 text-xs bg-gradient-to-br from-gray-900 to-gray-950">
                  <div className="text-center">Select an asset in Market Ladder</div>
                </div>
              )}
            </div>
          );
        }
        case "executions":
          return wrap(<ExecutionsPanel />);
        case "decision-log":
          return wrap(<DecisionLog />);
        case "market-match":
          return wrap(<MarketMatch />);
        case "admin":
          return wrap(<AdminPanel />);
        case "news":
          return wrap(<AnalysisPanel />);
        case "news-sources":
          return wrap(<NewsSourcesPanel />);
        case "order-progress":
          return wrap(<OrderProgressPanel />);
        case "market-heatmap":
          return wrap(<MarketHeatmap />);
        default:
          return wrap(<div className="text-gray-600 text-xs p-4">Unknown panel: {panelType}</div>);
      }
    },
    [legacySelectedAsset, channelsData]
  );

  const onRenderTab = useCallback(
    (node: TabNode, renderValues: { content: ReactNode; buttons: ReactNode[] }) => {
      const cfg = node.getConfig() as TabChannelConfig | undefined;
      const panelType = cfg?.panelType;

      const isPinned = cfg?.pinned ?? !(node.isEnableDrag() && node.isEnableClose());
      renderValues.buttons.push(
        <button
          key="pin"
          type="button"
          title={
            isPinned
              ? "Unpin panel — allow moving and closing"
              : "Pin panel — prevent moving or closing"
          }
          onClick={() => {
            const next = !isPinned;
            model.doAction(
              Actions.updateNodeAttributes(node.getId(), {
                enableDrag: !next,
                enableClose: !next,
              })
            );
            model.doAction(
              Actions.updateNodeAttributes(node.getId(), {
                config: { ...cfg, pinned: next },
              })
            );
            setModel(Model.fromJson(model.toJson() as IJsonModel));
          }}
          className={`flex items-center justify-center w-4 h-4 rounded transition-colors ${
            isPinned ? "text-amber-400 hover:text-amber-300" : "text-gray-600 hover:text-gray-400"
          }`}
          style={{ fontSize: "10px", lineHeight: 1 }}
        >
          {isPinned ? "◈" : "◇"}
        </button>
      );

      if (panelType) {
        const desc = PANEL_DESCRIPTIONS[panelType];
        renderValues.content = (
          <span title={desc} className="flex items-center gap-1">
            {renderValues.content}
          </span>
        );
      }

      const ASSET_RECEIVER_PANELS: ReadonlySet<PanelId> = new Set([
        "candle-chart",
        "market-depth",
        "order-ticket",
        "algo-monitor",
        "decision-log",
        "market-match",
        "executions",
      ]);

      if (panelType && ASSET_RECEIVER_PANELS.has(panelType)) {
        const incoming = cfg?.incoming ?? null;
        const symbol =
          incoming !== null
            ? (channelsData[incoming]?.selectedAsset ?? legacySelectedAsset)
            : legacySelectedAsset;
        if (symbol) {
          const inCh = incoming !== null ? CHANNEL_COLOURS[incoming] : null;
          const desc = panelType ? PANEL_DESCRIPTIONS[panelType] : undefined;
          const bracketMatch = panelType ? PANEL_TITLES[panelType].match(/(\(.*\))$/) : null;
          const bracket = bracketMatch?.[1];
          renderValues.content = (
            <span title={desc} className="flex items-center gap-1">
              {inCh && (
                <span
                  className="w-1.5 h-1.5 rounded-full inline-block shrink-0"
                  style={{ backgroundColor: inCh.hex }}
                />
              )}
              <span>{symbol}</span>
              {bracket && <span className="text-gray-500 font-normal">{bracket}</span>}
            </span>
          );
        }
      }

      const btns = tabChannelButtons({
        node,
        allItems: layout,
        onChannelChange: handleChannelChange,
      });
      for (const b of btns) renderValues.buttons.push(b);
    },
    [layout, handleChannelChange, channelsData, legacySelectedAsset, model, setModel]
  );

  const onModelChange = useCallback(
    (m: Model) => {
      setModel(m);
    },
    [setModel]
  );

  const onRenderTabSet = useCallback(
    (tabSetNode: TabSetNode | BorderNode, renderValues: { buttons: ReactNode[] }) => {
      if (tabSetNode.getType() !== "tabset") return;
      const ts = tabSetNode as TabSetNode;
      const selectedNode = ts.getSelectedNode();
      if (!selectedNode || selectedNode.getType() !== "tab") return;
      const tab = selectedNode as TabNode;
      const cfg = tab.getConfig() as TabChannelConfig | undefined;
      const panelType = cfg?.panelType ?? (tab.getComponent() as PanelId);
      const instanceId = tab.getId();

      function doPopOut() {
        const params = new URLSearchParams({
          panel: instanceId,
          type: panelType,
          layout: storageKey,
        });
        const url = `${window.location.origin}${window.location.pathname}?${params}`;
        const w = window.open(url, `panel-${instanceId}`, "width=1200,height=700,resizable=yes");
        if (w) {
          dispatch(panelPopped({ panelId: instanceId }));
          const interval = setInterval(() => {
            if (w.closed) {
              clearInterval(interval);
              dispatch(panelClosed({ panelId: instanceId }));
            }
          }, 500);
        }
      }

      function doDialog() {
        dispatch(panelDialogOpened({ panelId: instanceId, panelType }));
      }

      renderValues.buttons.push(
        <button
          key="dialog"
          type="button"
          title="Open panel in floating dialog"
          aria-label="Open panel in dialog"
          onClick={doDialog}
          className="flex items-center justify-center w-5 h-5 text-gray-500 hover:text-gray-200 transition-colors"
          style={{ fontSize: "11px" }}
        >
          □
        </button>,
        <button
          key="popout"
          type="button"
          title="Open panel in new browser window"
          aria-label="Open panel in new window"
          onClick={doPopOut}
          className="flex items-center justify-center w-5 h-5 text-gray-500 hover:text-gray-200 transition-colors"
          style={{ fontSize: "11px" }}
        >
          ↗
        </button>
      );
    },
    [dispatch, storageKey]
  );

  const onContextMenu = useCallback(
    (node: TabNode | TabSetNode | BorderNode, event: React.MouseEvent<HTMLElement>) => {
      event.preventDefault();
      const items: ContextMenuEntry[] = [];

      if (node.getType() === "tab") {
        const tab = node as TabNode;
        const cfg = tab.getConfig() as TabChannelConfig | undefined;
        const panelType = cfg?.panelType;
        const tabSetNode = tab.getParent() as TabSetNode | null;
        const isMaximized = tabSetNode?.isMaximized() ?? false;

        const tabCfg = tab.getConfig() as TabChannelConfig | undefined;
        const isTabPinned = tabCfg?.pinned ?? !(tab.isEnableDrag() && tab.isEnableClose());
        items.push(
          {
            label: isMaximized ? "Restore" : "Maximise panel",
            icon: isMaximized ? "⊡" : "⊞",
            onClick: () => {
              if (tabSetNode) model.doAction(Actions.maximizeToggle(tabSetNode.getId()));
              setModel(Model.fromJson(model.toJson() as IJsonModel));
            },
          },
          {
            label: isTabPinned ? "Unpin panel" : "Pin panel",
            icon: isTabPinned ? "◇" : "◈",
            title: isTabPinned ? "Allow moving and closing" : "Prevent moving or closing",
            onClick: () => {
              const next = !isTabPinned;
              model.doAction(
                Actions.updateNodeAttributes(tab.getId(), {
                  enableDrag: !next,
                  enableClose: !next,
                  config: { ...tabCfg, pinned: next },
                })
              );
              setModel(Model.fromJson(model.toJson() as IJsonModel));
            },
          },
          { separator: true },
          {
            label: "Close panel",
            icon: "✕",
            danger: true,
            onClick: () => {
              if (panelType) removePanel(panelType);
              else model.doAction(Actions.deleteTab(tab.getId()));
            },
          }
        );
      } else if (node.getType() === "tabset") {
        const tabset = node as TabSetNode;
        const isMaximized = tabset.isMaximized();
        items.push(
          {
            label: isMaximized ? "Restore" : "Maximise tabset",
            icon: isMaximized ? "⊡" : "⊞",
            onClick: () => {
              model.doAction(Actions.maximizeToggle(tabset.getId()));
              setModel(Model.fromJson(model.toJson() as IJsonModel));
            },
          },
          { separator: true, label: "Add panel here" }
        );

        const openTypes = new Set(layout.map((l) => l.panelType));
        for (const id of PANEL_IDS) {
          if (id === "admin") continue;
          const alreadyOpen = openTypes.has(id);
          if (SINGLETON_PANELS.has(id) && alreadyOpen) continue;
          items.push({
            label: PANEL_TITLES[id],
            icon: "+",
            onClick: () => addPanel(id),
          });
        }
      }

      if (items.length > 0) {
        tabCtxMenu.value = { x: event.clientX, y: event.clientY, items };
      }
    },
    [model, setModel, layout, addPanel, removePanel, tabCtxMenu]
  );

  return (
    <div className="h-full w-full relative">
      <Layout
        model={model}
        factory={factory}
        onRenderTab={onRenderTab}
        onRenderTabSet={onRenderTabSet}
        onModelChange={onModelChange}
        onContextMenu={onContextMenu}
        onExternalDrag={(_event) => {
          const panelType = draggedPanelId as PanelId | "";
          if (!panelType || !PANEL_IDS.includes(panelType as PanelId)) return undefined;
          if (SINGLETON_PANELS.has(panelType) && activePanelIds.has(panelType)) return undefined;
          return {
            json: {
              type: "tab",
              id: `${panelType}-${Date.now()}`,
              name: PANEL_TITLES[panelType],
              component: panelType,
              config: { panelType } satisfies TabChannelConfig,
            },
            onDrop: () => clearDraggedPanelId(),
          };
        }}
      />
      {tabCtxMenu.value && (
        <ContextMenu
          items={tabCtxMenu.value.items}
          x={tabCtxMenu.value.x}
          y={tabCtxMenu.value.y}
          onClose={() => {
            tabCtxMenu.value = null;
          }}
        />
      )}
      {Object.entries(dialogs)
        .filter(([, d]) => d.open)
        .map(([instanceId, d]) => (
          <PanelDialog
            key={instanceId}
            instanceId={instanceId}
            panelType={d.panelType}
            onClose={() => dispatch(panelDialogClosed({ panelId: instanceId }))}
          />
        ))}
    </div>
  );
}

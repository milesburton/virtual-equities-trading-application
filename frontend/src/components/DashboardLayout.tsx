import type { BorderNode, IJsonModel, IJsonTabNode, TabNode, TabSetNode } from "flexlayout-react";
import { Actions, DockLocation, Layout, Model } from "flexlayout-react";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "flexlayout-react/style/dark.css";
import { useSignal } from "@preact/signals-react";
import { ChannelContext } from "../contexts/ChannelContext.tsx";
import type { ChannelNumber } from "../store/channelsSlice.ts";
import { useAppSelector } from "../store/hooks.ts";
import { AdminPanel } from "./AdminPanel.tsx";
import { AlgoMonitor } from "./AlgoMonitor.tsx";
import { CandlestickChart } from "./CandlestickChart.tsx";
import type { ContextMenuEntry } from "./ContextMenu.tsx";
import { ContextMenu } from "./ContextMenu.tsx";
import { DecisionLog } from "./DecisionLog.tsx";
import { ExecutionsPanel } from "./ExecutionsPanel.tsx";
import { MarketDepth } from "./MarketDepth.tsx";
import { MarketLadder } from "./MarketLadder.tsx";
import { MarketMatch } from "./MarketMatch.tsx";
import { ObservabilityPanel } from "./ObservabilityPanel.tsx";
import { OrderBlotter } from "./OrderBlotter.tsx";
import { OrderTicket } from "./OrderTicket.tsx";

export type { ChannelNumber };

export const CHANNEL_COLOURS: Record<ChannelNumber, { hex: string; tw: string; label: string }> = {
  1: { hex: "#3b82f6", tw: "blue", label: "Blue" },
  2: { hex: "#22c55e", tw: "green", label: "Green" },
  3: { hex: "#eab308", tw: "yellow", label: "Yellow" },
  4: { hex: "#ef4444", tw: "red", label: "Red" },
  5: { hex: "#a855f7", tw: "purple", label: "Purple" },
  6: { hex: "#f97316", tw: "orange", label: "Orange" },
};

export const PANEL_IDS = [
  "market-ladder",
  "order-ticket",
  "order-blotter",
  "algo-monitor",
  "observability",
  "candle-chart",
  "market-depth",
  "executions",
  "decision-log",
  "market-match",
  "admin",
] as const;

export type PanelId = (typeof PANEL_IDS)[number];

export const PANEL_TITLES: Record<PanelId, string> = {
  "market-ladder": "Market Ladder",
  "order-ticket": "Order Ticket",
  "order-blotter": "Order Blotter",
  "algo-monitor": "Algo Monitor",
  observability: "Observability",
  "candle-chart": "Price Chart",
  "market-depth": "Market Depth",
  executions: "Executions",
  "decision-log": "Decision Log",
  "market-match": "Market Match",
  admin: "Admin",
};

// Panels that can only have one instance at a time
export const SINGLETON_PANELS: ReadonlySet<PanelId> = new Set([
  "order-ticket",
  "order-blotter",
  "observability",
  "executions",
  "admin",
]);

export const PANEL_CHANNEL_CAPS: Record<PanelId, { out: boolean; in: boolean }> = {
  "market-ladder": { out: true, in: false },
  "order-ticket": { out: false, in: true },
  "candle-chart": { out: false, in: true },
  "market-depth": { out: false, in: true },
  "order-blotter": { out: true, in: false },
  "algo-monitor": { out: false, in: true },
  observability: { out: false, in: false },
  executions: { out: false, in: true },
  "decision-log": { out: false, in: true },
  "market-match": { out: false, in: true },
  admin: { out: false, in: false },
};

export interface LayoutItem {
  i: string;
  panelType: PanelId;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  outgoing?: ChannelNumber;
  incoming?: ChannelNumber;
}

interface TabChannelConfig {
  panelType: PanelId;
  outgoing?: ChannelNumber;
  incoming?: ChannelNumber;
}

function makeDefaultModel(): IJsonModel {
  return {
    global: {
      tabEnableClose: true,
      tabEnableRename: false,
      tabSetEnableMaximize: true,
      tabSetEnableDeleteWhenEmpty: true,
      tabSetEnableSingleTabStretch: false,
      splitterSize: 4,
      splitterExtra: 4,
    },
    layout: {
      type: "row",
      children: [
        {
          type: "tabset",
          weight: 16,

          children: [
            {
              type: "tab",
              id: "order-ticket",
              name: PANEL_TITLES["order-ticket"],
              component: "order-ticket",
              config: { panelType: "order-ticket", incoming: 1 } satisfies TabChannelConfig,
            },
          ],
        },
        {
          type: "tabset",
          weight: 25,

          children: [
            {
              type: "tab",
              id: "market-ladder",
              name: PANEL_TITLES["market-ladder"],
              component: "market-ladder",
              config: { panelType: "market-ladder", outgoing: 1 } satisfies TabChannelConfig,
            },
          ],
        },
        {
          type: "row",
          weight: 59,
          children: [
            {
              type: "row",
              weight: 70,
              children: [
                {
                  type: "tabset",
                  weight: 57,

                  children: [
                    {
                      type: "tab",
                      id: "candle-chart",
                      name: PANEL_TITLES["candle-chart"],
                      component: "candle-chart",
                      config: { panelType: "candle-chart", incoming: 1 } satisfies TabChannelConfig,
                    },
                  ],
                },
                {
                  type: "tabset",
                  weight: 43,

                  children: [
                    {
                      type: "tab",
                      id: "market-depth",
                      name: PANEL_TITLES["market-depth"],
                      component: "market-depth",
                      config: { panelType: "market-depth", incoming: 1 } satisfies TabChannelConfig,
                    },
                  ],
                },
              ],
            },
            {
              type: "row",
              weight: 30,
              children: [
                {
                  type: "tabset",
                  weight: 35,
                  children: [
                    {
                      type: "tab",
                      id: "algo-monitor",
                      name: PANEL_TITLES["algo-monitor"],
                      component: "algo-monitor",
                      config: { panelType: "algo-monitor", incoming: 2 } satisfies TabChannelConfig,
                    },
                  ],
                },
                {
                  type: "tabset",
                  weight: 35,
                  children: [
                    {
                      type: "tab",
                      id: "decision-log",
                      name: PANEL_TITLES["decision-log"],
                      component: "decision-log",
                      config: { panelType: "decision-log" } satisfies TabChannelConfig,
                    },
                  ],
                },
                {
                  type: "tabset",
                  weight: 30,

                  children: [
                    {
                      type: "tab",
                      id: "observability",
                      name: PANEL_TITLES.observability,
                      component: "observability",
                      config: { panelType: "observability" } satisfies TabChannelConfig,
                    },
                  ],
                },
              ],
            },
            {
              type: "tabset",
              weight: 12,

              children: [
                {
                  type: "tab",
                  id: "order-blotter",
                  name: PANEL_TITLES["order-blotter"],
                  component: "order-blotter",
                  config: { panelType: "order-blotter", outgoing: 2 } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 10,

              children: [
                {
                  type: "tab",
                  id: "executions",
                  name: PANEL_TITLES.executions,
                  component: "executions",
                  config: { panelType: "executions", incoming: 2 } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

export const STORAGE_KEY_PREFIX = "dashboard-layout";
export const STORAGE_KEY = STORAGE_KEY_PREFIX;

const LAYOUT_VERSION = 10;

function makeExecutionModel(): IJsonModel {
  return {
    global: makeDefaultModel().global,
    layout: {
      type: "row",
      children: [
        {
          type: "tabset",
          weight: 22,
          children: [
            {
              type: "tab",
              id: "order-ticket",
              name: PANEL_TITLES["order-ticket"],
              component: "order-ticket",
              config: { panelType: "order-ticket", incoming: 1 } satisfies TabChannelConfig,
            },
          ],
        },
        {
          type: "tabset",
          weight: 36,
          children: [
            {
              type: "tab",
              id: "market-ladder",
              name: PANEL_TITLES["market-ladder"],
              component: "market-ladder",
              config: { panelType: "market-ladder", outgoing: 1 } satisfies TabChannelConfig,
            },
          ],
        },
        {
          type: "tabset",
          weight: 42,
          children: [
            {
              type: "tab",
              id: "order-blotter",
              name: PANEL_TITLES["order-blotter"],
              component: "order-blotter",
              config: { panelType: "order-blotter" } satisfies TabChannelConfig,
            },
          ],
        },
      ],
    },
  };
}

function makeAlgoModel(): IJsonModel {
  return {
    global: makeDefaultModel().global,
    layout: {
      type: "row",
      children: [
        {
          type: "row",
          weight: 65,
          children: [
            {
              type: "tabset",
              weight: 60,
              children: [
                {
                  type: "tab",
                  id: "candle-chart",
                  name: PANEL_TITLES["candle-chart"],
                  component: "candle-chart",
                  config: { panelType: "candle-chart", incoming: 1 } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 40,
              children: [
                {
                  type: "tab",
                  id: "market-depth",
                  name: PANEL_TITLES["market-depth"],
                  component: "market-depth",
                  config: { panelType: "market-depth", incoming: 1 } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
        {
          type: "row",
          weight: 35,
          children: [
            {
              type: "tabset",
              weight: 50,
              children: [
                {
                  type: "tab",
                  id: "algo-monitor",
                  name: PANEL_TITLES["algo-monitor"],
                  component: "algo-monitor",
                  config: { panelType: "algo-monitor", incoming: 2 } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 50,
              children: [
                {
                  type: "tab",
                  id: "order-blotter",
                  name: PANEL_TITLES["order-blotter"],
                  component: "order-blotter",
                  config: { panelType: "order-blotter", outgoing: 2 } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

function makeAnalysisModel(): IJsonModel {
  return {
    global: makeDefaultModel().global,
    layout: {
      type: "row",
      children: [
        {
          type: "tabset",
          weight: 28,
          children: [
            {
              type: "tab",
              id: "market-ladder",
              name: PANEL_TITLES["market-ladder"],
              component: "market-ladder",
              config: { panelType: "market-ladder", outgoing: 1 } satisfies TabChannelConfig,
            },
          ],
        },
        {
          type: "row",
          weight: 72,
          children: [
            {
              type: "tabset",
              weight: 60,
              children: [
                {
                  type: "tab",
                  id: "candle-chart",
                  name: PANEL_TITLES["candle-chart"],
                  component: "candle-chart",
                  config: { panelType: "candle-chart", incoming: 1 } satisfies TabChannelConfig,
                },
              ],
            },
            {
              type: "tabset",
              weight: 40,
              children: [
                {
                  type: "tab",
                  id: "market-depth",
                  name: PANEL_TITLES["market-depth"],
                  component: "market-depth",
                  config: { panelType: "market-depth", incoming: 1 } satisfies TabChannelConfig,
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

function saveFlexModel(storageKey: string, model: Model) {
  localStorage.setItem(storageKey, JSON.stringify({ _v: LAYOUT_VERSION, flex: model.toJson() }));
}

function loadFlexModel(storageKey: string): Model {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed._v === LAYOUT_VERSION && parsed.flex) {
        return Model.fromJson(parsed.flex as IJsonModel);
      }
    }
  } catch {
    // fall through
  }
  return Model.fromJson(makeDefaultModel());
}

export function modelToLayoutItems(model: Model): LayoutItem[] {
  const items: LayoutItem[] = [];
  model.visitNodes((node) => {
    if (node.getType() === "tab") {
      const tab = node as TabNode;
      const cfg = tab.getConfig() as TabChannelConfig | undefined;
      if (cfg?.panelType) {
        items.push({
          i: tab.getId(),
          panelType: cfg.panelType,
          x: 0,
          y: 0,
          w: 4,
          h: 6,
          outgoing: cfg.outgoing,
          incoming: cfg.incoming,
        });
      }
    }
  });
  return items;
}

export const DEFAULT_LAYOUT: LayoutItem[] = modelToLayoutItems(Model.fromJson(makeDefaultModel()));

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

export interface DashboardContextValue {
  layout: LayoutItem[];
  setLayout: (next: LayoutItem[] | ((prev: LayoutItem[]) => LayoutItem[])) => void;
  activePanelIds: Set<PanelId>;
  addPanel: (id: PanelId) => void;
  removePanel: (id: PanelId) => void;
  resetLayout: (templateModel?: IJsonModel) => void;
  storageKey: string;
  model: Model;
  setModel: (m: Model) => void;
}

export const DashboardContext = createContext<DashboardContextValue>({
  layout: DEFAULT_LAYOUT,
  setLayout: () => {},
  activePanelIds: new Set(),
  addPanel: () => {},
  removePanel: () => {},
  resetLayout: () => {},
  storageKey: STORAGE_KEY,
  model: Model.fromJson(makeDefaultModel()),
  setModel: () => {},
});

export function useDashboard() {
  return useContext(DashboardContext);
}

interface DashboardProviderProps {
  children: ReactNode;
  storageKey?: string;
}

export function DashboardProvider({ children, storageKey = STORAGE_KEY }: DashboardProviderProps) {
  const [model, setModelState] = useState<Model>(() => loadFlexModel(storageKey));
  const [layout, setLayoutState] = useState<LayoutItem[]>(() => modelToLayoutItems(model));

  const activePanelIds = new Set(layout.map((l) => l.panelType));

  const setModel = useCallback(
    (m: Model) => {
      setModelState(m);
      const items = modelToLayoutItems(m);
      setLayoutState(items);
      saveFlexModel(storageKey, m);
    },
    [storageKey]
  );

  const setLayout = useCallback(
    (_next: LayoutItem[] | ((prev: LayoutItem[]) => LayoutItem[])) => {},
    []
  );

  const addPanel = useCallback(
    (panelType: PanelId) => {
      setModelState((prev) => {
        // Singletons: only allow one instance
        if (
          SINGLETON_PANELS.has(panelType) &&
          modelToLayoutItems(prev).some((l) => l.panelType === panelType)
        )
          return prev;

        const newTab: IJsonTabNode = {
          type: "tab",
          id: `${panelType}-${Date.now()}`,
          name: PANEL_TITLES[panelType],
          component: panelType,
          config: { panelType } satisfies TabChannelConfig,
        };

        let targetId: string | undefined;
        prev.visitNodes((node) => {
          if (!targetId && node.getType() === "tabset") {
            targetId = node.getId();
          }
        });
        if (!targetId) return prev;

        const next = Model.fromJson(prev.toJson() as IJsonModel);
        next.doAction(Actions.addNode(newTab, targetId, DockLocation.CENTER, -1));
        saveFlexModel(storageKey, next);
        setLayoutState(modelToLayoutItems(next));
        return next;
      });
    },
    [storageKey]
  );

  const removePanel = useCallback(
    (panelType: PanelId) => {
      setModelState((prev) => {
        let tabId: string | undefined;
        prev.visitNodes((node) => {
          if (!tabId && node.getType() === "tab") {
            const cfg = (node as TabNode).getConfig() as TabChannelConfig | undefined;
            if (cfg?.panelType === panelType) tabId = node.getId();
          }
        });
        if (!tabId) return prev;

        const next = Model.fromJson(prev.toJson() as IJsonModel);
        next.doAction(Actions.deleteTab(tabId));
        saveFlexModel(storageKey, next);
        setLayoutState(modelToLayoutItems(next));
        return next;
      });
    },
    [storageKey]
  );

  const resetLayout = useCallback(
    (templateModel?: IJsonModel) => {
      const next = Model.fromJson(templateModel ?? makeDefaultModel());
      saveFlexModel(storageKey, next);
      setModelState(next);
      setLayoutState(modelToLayoutItems(next));
    },
    [storageKey]
  );

  return (
    <DashboardContext.Provider
      value={{
        layout,
        setLayout,
        activePanelIds,
        addPanel,
        removePanel,
        resetLayout,
        storageKey,
        model,
        setModel,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

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
  const arrow = isOut ? "→" : "←";
  const dirLabel = isOut ? "Broadcast" : "Listen";
  const disabledLabel = isOut ? "This panel cannot broadcast" : "This panel cannot listen";

  // Find panels connected on this channel for the tooltip
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
        className={`flex items-center gap-0.5 rounded px-1.5 py-0.5 transition-colors text-[9px] font-mono font-medium leading-none ${
          disabled
            ? "opacity-20 cursor-not-allowed"
            : colour
              ? "hover:bg-gray-700/60"
              : "hover:bg-gray-700/40 border border-dashed border-gray-700 hover:border-gray-500"
        }`}
      >
        {colour && !disabled ? (
          <>
            <span style={{ color: colour.hex }}>{arrow}</span>
            <span className="font-mono tabular-nums" style={{ color: colour.hex }}>
              {current}
            </span>
          </>
        ) : (
          <span className="text-gray-600">{arrow}</span>
        )}
      </button>
      {dropdown}
    </div>
  );
}

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

export function DashboardLayout() {
  const legacySelectedAsset = useAppSelector((s) => s.ui.selectedAsset);
  const candleHistory = useAppSelector((s) => s.market.candleHistory);
  const candlesReady = useAppSelector((s) => s.market.candlesReady);
  const channelsData = useAppSelector((s) => s.channels.data);
  const { model, setModel, layout, removePanel, addPanel } = useDashboard();

  // Tab/tabset right-click context menu
  const tabCtxMenu = useSignal<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);

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
        case "candle-chart": {
          const chartSymbol =
            incoming !== null
              ? (channelsData[incoming]?.selectedAsset ?? legacySelectedAsset)
              : legacySelectedAsset;
          return wrap(
            chartSymbol && candlesReady[chartSymbol] && candleHistory[chartSymbol] ? (
              <CandlestickChart symbol={chartSymbol} candles={candleHistory[chartSymbol]} />
            ) : (
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
            )
          );
        }
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
        default:
          return wrap(<div className="text-gray-600 text-xs p-4">Unknown panel: {panelType}</div>);
      }
    },
    [legacySelectedAsset, candleHistory, candlesReady, channelsData]
  );

  const onRenderTab = useCallback(
    (node: TabNode, renderValues: { content: ReactNode; buttons: ReactNode[] }) => {
      const cfg = node.getConfig() as TabChannelConfig | undefined;
      if (cfg?.panelType === "candle-chart") {
        const incoming = cfg.incoming ?? null;
        const symbol =
          incoming !== null
            ? (channelsData[incoming]?.selectedAsset ?? legacySelectedAsset)
            : legacySelectedAsset;
        if (symbol) renderValues.content = symbol;
      }

      const btns = tabChannelButtons({
        node,
        allItems: layout,
        onChannelChange: handleChannelChange,
      });
      for (const b of btns) renderValues.buttons.push(b);
    },
    [layout, handleChannelChange, channelsData, legacySelectedAsset]
  );

  const onModelChange = useCallback(
    (m: Model) => {
      setModel(m);
    },
    [setModel]
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

        items.push(
          {
            label: isMaximized ? "Restore" : "Maximise panel",
            icon: isMaximized ? "⊡" : "⊞",
            onClick: () => {
              if (tabSetNode) model.doAction(Actions.maximizeToggle(tabSetNode.getId()));
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

        // Show panels that aren't already open (or are non-singletons)
        const openTypes = new Set(layout.map((l) => l.panelType));
        for (const id of PANEL_IDS) {
          if (id === "admin") continue; // skip admin in context menu
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
        onModelChange={onModelChange}
        onContextMenu={onContextMenu}
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
    </div>
  );
}

export const LAYOUT_TEMPLATES: {
  id: string;
  label: string;
  description: string;
  model: IJsonModel;
}[] = [
  {
    id: "full",
    label: "Full Dashboard",
    description: "All panels — complete trading view",
    model: makeDefaultModel(),
  },
  {
    id: "execution",
    label: "Execution",
    description: "Order entry, ladder, and blotter",
    model: makeExecutionModel(),
  },
  {
    id: "algo",
    label: "Algo Trading",
    description: "Algorithm monitor, chart, and blotter",
    model: makeAlgoModel(),
  },
  {
    id: "analysis",
    label: "Market Analysis",
    description: "Chart, depth, and ladder — no order entry",
    model: makeAnalysisModel(),
  },
];

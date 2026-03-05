import type { IJsonModel, IJsonTabNode, TabNode } from "flexlayout-react";
import { Actions, DockLocation, Model } from "flexlayout-react";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useState } from "react";
import { makeDefaultModel, STORAGE_KEY } from "./layoutModels.ts";
import type { LayoutItem, TabChannelConfig } from "./layoutUtils.ts";
import { DEFAULT_LAYOUT, modelToLayoutItems } from "./layoutUtils.ts";
import type { PanelId } from "./panelRegistry.ts";
import { PANEL_TITLES, SINGLETON_PANELS } from "./panelRegistry.ts";

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
  initialModel?: IJsonModel;
}

export function DashboardProvider({
  children,
  storageKey = STORAGE_KEY,
  initialModel,
}: DashboardProviderProps) {
  const [model, setModelState] = useState<Model>(() =>
    Model.fromJson(initialModel ?? makeDefaultModel())
  );
  const [layout, setLayoutState] = useState<LayoutItem[]>(() => modelToLayoutItems(model));

  const activePanelIds = new Set(layout.map((l) => l.panelType));

  const setModel = useCallback((m: Model) => {
    setModelState(m);
    setLayoutState(modelToLayoutItems(m));
  }, []);

  const setLayout = useCallback(
    (_next: LayoutItem[] | ((prev: LayoutItem[]) => LayoutItem[])) => {},
    []
  );

  const addPanel = useCallback((panelType: PanelId) => {
    setModelState((prev) => {
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
      setLayoutState(modelToLayoutItems(next));
      return next;
    });
  }, []);

  const removePanel = useCallback((panelType: PanelId) => {
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
      setLayoutState(modelToLayoutItems(next));
      return next;
    });
  }, []);

  const resetLayout = useCallback((templateModel?: IJsonModel) => {
    const next = Model.fromJson(templateModel ?? makeDefaultModel());
    setModelState(next);
    setLayoutState(modelToLayoutItems(next));
  }, []);

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

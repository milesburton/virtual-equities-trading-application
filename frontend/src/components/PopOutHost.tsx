import type { IJsonModel } from "flexlayout-react";
import { Model } from "flexlayout-react";
import type { ChannelContextValue } from "../contexts/ChannelContext.tsx";
import { ChannelContext } from "../contexts/ChannelContext.tsx";
import { AlgoMonitor } from "./AlgoMonitor.tsx";
import type { LayoutItem, PanelId } from "./DashboardLayout.tsx";
import { modelToLayoutItems } from "./DashboardLayout.tsx";
import { MarketLadder } from "./MarketLadder.tsx";
import { ObservabilityPanel } from "./ObservabilityPanel.tsx";
import { OrderBlotter } from "./OrderBlotter.tsx";

const PANEL_MAP: Record<string, React.ComponentType> = {
  "order-blotter": OrderBlotter,
  "algo-monitor": AlgoMonitor,
  observability: ObservabilityPanel,
  "market-ladder": MarketLadder,
};

/** Read channel assignments for a given instance from the persisted layout.
 *  Supports both the new flexlayout format (_v:4) and old grid format (_v:3). */
function loadChannelContext(
  instanceId: string,
  panelType: PanelId,
  layoutKey: string
): ChannelContextValue {
  try {
    const raw = localStorage.getItem(layoutKey);
    if (raw) {
      const parsed = JSON.parse(raw);

      // New flexlayout format
      if (parsed._v === 4 && parsed.flex) {
        const model = Model.fromJson(parsed.flex as IJsonModel);
        const items = modelToLayoutItems(model);
        const item = items.find((it) => it.i === instanceId);
        if (item) {
          return {
            instanceId,
            panelType,
            outgoing: item.outgoing ?? null,
            incoming: item.incoming ?? null,
          };
        }
      }

      // Legacy grid format (_v:3)
      if (parsed._v === 3 && Array.isArray(parsed.items)) {
        const items: LayoutItem[] = parsed.items;
        const item = items.find((it) => it.i === instanceId);
        if (item) {
          return {
            instanceId,
            panelType,
            outgoing: item.outgoing ?? null,
            incoming: item.incoming ?? null,
          };
        }
      }
    }
  } catch {
    // ignore parse errors
  }
  return { instanceId, panelType, outgoing: null, incoming: null };
}

export function PopOutHost({
  instanceId,
  panelType,
  layoutKey,
}: {
  instanceId: string;
  panelType: string;
  layoutKey: string;
}) {
  const PanelComponent = PANEL_MAP[panelType];
  if (!PanelComponent) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-500 text-sm">
        Unknown panel: {panelType}
      </div>
    );
  }

  const channelCtx = loadChannelContext(instanceId, panelType as PanelId, layoutKey);

  return (
    <ChannelContext.Provider value={channelCtx}>
      <div className="h-screen bg-gray-950 text-gray-100 overflow-hidden">
        <PanelComponent />
      </div>
    </ChannelContext.Provider>
  );
}

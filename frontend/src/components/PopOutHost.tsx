import { AlgoMonitor } from "./AlgoMonitor.tsx";
import { MarketLadder } from "./MarketLadder.tsx";
import { ObservabilityPanel } from "./ObservabilityPanel.tsx";
import { OrderBlotter } from "./OrderBlotter.tsx";

const PANEL_MAP: Record<string, React.ComponentType> = {
  "order-blotter": OrderBlotter,
  "algo-monitor": AlgoMonitor,
  observability: ObservabilityPanel,
  "market-ladder": MarketLadder,
};

export function PopOutHost({ panelId }: { panelId: string }) {
  const PanelComponent = PANEL_MAP[panelId];
  if (!PanelComponent) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-500 text-sm">
        Unknown panel: {panelId}
      </div>
    );
  }
  return (
    <div className="h-screen bg-gray-950 text-gray-100 overflow-hidden">
      <PanelComponent />
    </div>
  );
}

import type { IJsonModel } from "flexlayout-react";
import { Model } from "flexlayout-react";
import type React from "react";
import type { ChannelContextValue } from "../contexts/ChannelContext.tsx";
import { ChannelContext, useChannelContext } from "../contexts/ChannelContext.tsx";
import { useAppSelector } from "../store/hooks.ts";
import { AdminPanel } from "./AdminPanel.tsx";
import { AlgoMonitor } from "./AlgoMonitor.tsx";
import { AnalysisPanel } from "./AnalysisPanel.tsx";
import { CandlestickChart } from "./CandlestickChart.tsx";
import type { LayoutItem, PanelId } from "./DashboardLayout.tsx";
import { modelToLayoutItems } from "./DashboardLayout.tsx";
import { DecisionLog } from "./DecisionLog.tsx";
import { ExecutionsPanel } from "./ExecutionsPanel.tsx";
import { MarketDepth } from "./MarketDepth.tsx";
import { MarketHeatmap } from "./MarketHeatmap.tsx";
import { MarketLadder } from "./MarketLadder.tsx";
import { MarketMatch } from "./MarketMatch.tsx";
import { NewsSourcesPanel } from "./NewsSourcesPanel.tsx";
import { ObservabilityPanel } from "./ObservabilityPanel.tsx";
import { OrderBlotter } from "./OrderBlotter.tsx";
import { OrderProgressPanel } from "./OrderProgressPanel.tsx";
import { OrderTicket } from "./OrderTicket.tsx";

/** Candle chart wrapper — reads incoming channel from context to resolve symbol. */
function CandleChartForPopOut() {
  const { incoming } = useChannelContext();
  const legacySelectedAsset = useAppSelector((s) => s.ui.selectedAsset);
  const channelsData = useAppSelector((s) => s.channels.data);
  const symbol =
    incoming !== null
      ? (channelsData[incoming]?.selectedAsset ?? legacySelectedAsset)
      : legacySelectedAsset;
  const candles = useAppSelector((s) => (symbol ? s.market.candleHistory[symbol] : undefined));
  const ready = useAppSelector((s) => (symbol ? s.market.candlesReady[symbol] : false));

  if (symbol && ready && candles && (candles["1m"].length >= 2 || candles["5m"].length >= 2)) {
    return <CandlestickChart key={symbol} symbol={symbol} candles={candles} />;
  }
  return (
    <div className="flex items-center justify-center h-full text-gray-600 text-xs">
      Waiting for candle data…
    </div>
  );
}

/** Market depth wrapper — reads symbol from channel context. */
function MarketDepthForPopOut() {
  const { incoming } = useChannelContext();
  const legacySelectedAsset = useAppSelector((s) => s.ui.selectedAsset);
  const channelsData = useAppSelector((s) => s.channels.data);
  const symbol =
    incoming !== null
      ? (channelsData[incoming]?.selectedAsset ?? legacySelectedAsset)
      : (legacySelectedAsset ?? "AAPL");
  return <MarketDepth symbol={symbol ?? "AAPL"} />;
}

const PANEL_MAP: Record<string, React.ComponentType> = {
  "market-ladder": MarketLadder,
  "order-ticket": OrderTicket,
  "order-blotter": OrderBlotter,
  "algo-monitor": AlgoMonitor,
  observability: ObservabilityPanel,
  "candle-chart": CandleChartForPopOut,
  "market-depth": MarketDepthForPopOut,
  executions: ExecutionsPanel,
  "decision-log": DecisionLog,
  "market-match": MarketMatch,
  admin: AdminPanel,
  news: AnalysisPanel,
  "news-sources": NewsSourcesPanel,
  "order-progress": OrderProgressPanel,
  "market-heatmap": MarketHeatmap,
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

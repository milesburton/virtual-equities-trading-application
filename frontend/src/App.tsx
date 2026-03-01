import { useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { AlgoMonitor } from "./components/AlgoMonitor.tsx";
import { CandlestickChart } from "./components/CandlestickChart.tsx";
import { MarketLadder } from "./components/MarketLadder.tsx";
import { ObservabilityPanel } from "./components/ObservabilityPanel.tsx";
import { OrderBlotter } from "./components/OrderBlotter.tsx";
import { OrderTicket } from "./components/OrderTicket.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { TradingProvider } from "./context/TradingContext.tsx";
import { useMarketFeed } from "./hooks/useMarketFeed.ts";
import { useOrders } from "./hooks/useOrders.ts";
import { useServiceHealth } from "./hooks/useServiceHealth.ts";

export default function App() {
  const { assets, prices, priceHistory, candleHistory, connected } = useMarketFeed();
  const { orders, submitOrder } = useOrders(prices);
  const services = useServiceHealth();
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);

  return (
    <TradingProvider>
      <div className="flex flex-col h-screen bg-gray-950 text-gray-100 overflow-hidden">
        <StatusBar connected={connected} services={services} />

        <Group orientation="horizontal" className="flex-1 overflow-hidden">
          <Panel id="left-col" defaultSize={25} minSize={15}>
            <Group orientation="vertical" className="h-full">
              <Panel id="market-ladder" defaultSize={selectedAsset ? 50 : 100} minSize={20}>
                <MarketLadder
                  assets={assets}
                  prices={prices}
                  priceHistory={priceHistory}
                  selectedAsset={selectedAsset}
                  onSelectAsset={setSelectedAsset}
                />
              </Panel>

              {selectedAsset && candleHistory[selectedAsset] && (
                <>
                  <Separator className="h-1 bg-gray-700 hover:bg-emerald-600 transition-colors cursor-row-resize" />
                  <Panel id="candle-chart" defaultSize={50} minSize={20}>
                    <CandlestickChart
                      symbol={selectedAsset}
                      candles={candleHistory[selectedAsset]}
                      onClose={() => setSelectedAsset(null)}
                    />
                  </Panel>
                </>
              )}

              <Separator className="h-1 bg-gray-700 hover:bg-emerald-600 transition-colors cursor-row-resize" />
              <Panel id="order-ticket" defaultSize={50} minSize={20}>
                <OrderTicket assets={assets} prices={prices} onSubmit={submitOrder} />
              </Panel>
            </Group>
          </Panel>

          <Separator className="w-1 bg-gray-700 hover:bg-emerald-600 transition-colors cursor-col-resize" />

          <Panel id="right-col" defaultSize={75} minSize={30}>
            <Group orientation="vertical" className="h-full">
              <Panel id="order-blotter" defaultSize={50} minSize={20}>
                <OrderBlotter orders={orders} />
              </Panel>
              <Separator className="h-1 bg-gray-700 hover:bg-emerald-600 transition-colors cursor-row-resize" />
              <Panel id="algo-monitor" defaultSize={33} minSize={15}>
                <AlgoMonitor orders={orders} />
              </Panel>
              <Separator className="h-1 bg-gray-700 hover:bg-emerald-600 transition-colors cursor-row-resize" />
              <Panel id="observability" defaultSize={17} minSize={10}>
                <ObservabilityPanel />
              </Panel>
            </Group>
          </Panel>
        </Group>
      </div>
    </TradingProvider>
  );
}

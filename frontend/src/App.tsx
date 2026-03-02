import { Group, Panel, Separator } from "react-resizable-panels";
import { AlgoMonitor } from "./components/AlgoMonitor.tsx";
import { CandlestickChart } from "./components/CandlestickChart.tsx";
import { MarketLadder } from "./components/MarketLadder.tsx";
import { ObservabilityPanel } from "./components/ObservabilityPanel.tsx";
import { OrderBlotter } from "./components/OrderBlotter.tsx";
import { OrderTicket } from "./components/OrderTicket.tsx";
import { PopOutPlaceholder } from "./components/PopOutPlaceholder.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { TradingProvider } from "./context/TradingContext.tsx";
import { useAppDispatch, useAppSelector } from "./store/hooks.ts";
import { setSelectedAsset } from "./store/uiSlice.ts";

export default function App() {
  const dispatch = useAppDispatch();
  const selectedAsset = useAppSelector((s) => s.ui.selectedAsset);
  const candleHistory = useAppSelector((s) => s.market.candleHistory);

  const blotterPopped = useAppSelector((s) => s.windows.popOuts["order-blotter"].open);
  const algoPopped = useAppSelector((s) => s.windows.popOuts["algo-monitor"].open);
  const obsPopped = useAppSelector((s) => s.windows.popOuts["observability"].open);
  const ladderPopped = useAppSelector((s) => s.windows.popOuts["market-ladder"].open);

  return (
    <TradingProvider>
      <div className="flex flex-col h-screen bg-gray-950 text-gray-100 overflow-hidden">
        <StatusBar />

        <Group orientation="horizontal" className="flex-1 overflow-hidden">
          <Panel id="left-col" defaultSize={25} minSize={15}>
            <Group orientation="vertical" className="h-full">
              <Panel id="market-ladder" defaultSize={selectedAsset ? 50 : 100} minSize={20}>
                {ladderPopped ? <PopOutPlaceholder panelId="market-ladder" /> : <MarketLadder />}
              </Panel>

              {selectedAsset && candleHistory[selectedAsset] && (
                <>
                  <Separator className="h-1 bg-gray-700 hover:bg-emerald-600 transition-colors cursor-row-resize" />
                  <Panel id="candle-chart" defaultSize={50} minSize={20}>
                    <CandlestickChart
                      symbol={selectedAsset}
                      candles={candleHistory[selectedAsset]}
                      onClose={() => dispatch(setSelectedAsset(null))}
                    />
                  </Panel>
                </>
              )}

              <Separator className="h-1 bg-gray-700 hover:bg-emerald-600 transition-colors cursor-row-resize" />
              <Panel id="order-ticket" defaultSize={50} minSize={20}>
                <OrderTicket />
              </Panel>
            </Group>
          </Panel>

          <Separator className="w-1 bg-gray-700 hover:bg-emerald-600 transition-colors cursor-col-resize" />

          <Panel id="right-col" defaultSize={75} minSize={30}>
            <Group orientation="vertical" className="h-full">
              <Panel id="order-blotter" defaultSize={50} minSize={20}>
                {blotterPopped ? <PopOutPlaceholder panelId="order-blotter" /> : <OrderBlotter />}
              </Panel>
              <Separator className="h-1 bg-gray-700 hover:bg-emerald-600 transition-colors cursor-row-resize" />
              <Panel id="algo-monitor" defaultSize={33} minSize={15}>
                {algoPopped ? <PopOutPlaceholder panelId="algo-monitor" /> : <AlgoMonitor />}
              </Panel>
              <Separator className="h-1 bg-gray-700 hover:bg-emerald-600 transition-colors cursor-row-resize" />
              <Panel id="observability" defaultSize={17} minSize={10}>
                {obsPopped ? <PopOutPlaceholder panelId="observability" /> : <ObservabilityPanel />}
              </Panel>
            </Group>
          </Panel>
        </Group>
      </div>
    </TradingProvider>
  );
}

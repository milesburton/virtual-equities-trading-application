import { useSignal } from "@preact/signals-react";
import { useAppSelector } from "../store/hooks.ts";
import type { PanelId } from "./DashboardLayout.tsx";
import { PANEL_IDS, PANEL_TITLES, SINGLETON_PANELS, useDashboard } from "./DashboardLayout.tsx";

const PANEL_DESCRIPTIONS: Record<PanelId, string> = {
  "market-ladder": "Live bid/ask ladder for any asset",
  "order-ticket": "Submit buy/sell orders",
  "order-blotter": "Live view of all open orders",
  "algo-monitor": "Monitor running algo strategies",
  observability: "System events and service health",
  "candle-chart": "OHLCV candlestick price chart",
  "market-depth": "Order book depth visualisation",
  executions: "Filled order history and analytics",
  "decision-log": "Real-time algo reasoning — every slice, fill, and decision",
  "market-match": "Live fill tape: venue, counterparty, liquidity, and impact",
  admin: "Admin controls",
  news: "Live market news with sentiment scoring",
};

export function ComponentPicker() {
  const open = useSignal(false);
  const { activePanelIds, addPanel } = useDashboard();
  const user = useAppSelector((s) => s.auth.user);

  const visiblePanelIds = PANEL_IDS.filter((id) => {
    if (id === "admin") return user?.role === "admin";
    return true;
  });

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          open.value = !open.value;
        }}
        title="Add a panel to the workspace"
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 transition-colors px-1.5 py-0.5 rounded border border-gray-700 hover:border-gray-500"
      >
        <span className="text-sm leading-none">⊞</span>
        Add Panel
      </button>

      {open.value && (
        <>
          <button
            type="button"
            aria-label="Close panel picker"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => {
              open.value = false;
            }}
          />

          <div className="absolute left-0 top-8 z-20 w-60 bg-gray-900 border border-gray-700 rounded shadow-xl text-xs">
            <div className="px-3 py-2 border-b border-gray-700 font-semibold text-gray-300 uppercase tracking-wider text-[10px]">
              Add Panel
            </div>
            <ul className="py-1">
              {visiblePanelIds.map((id: PanelId) => {
                const isSingleton = SINGLETON_PANELS.has(id);
                const alreadyOpen = activePanelIds.has(id);
                const disabled = isSingleton && alreadyOpen;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      disabled={disabled}
                      draggable={!disabled}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/panel-id", id);
                        e.dataTransfer.effectAllowed = "copy";
                        open.value = false;
                      }}
                      onClick={() => {
                        addPanel(id);
                        open.value = false;
                      }}
                      title={
                        disabled ? `${PANEL_TITLES[id]} is already open` : PANEL_DESCRIPTIONS[id]
                      }
                      className={`w-full flex items-center justify-between px-3 py-2 transition-colors text-left gap-3 ${
                        disabled
                          ? "opacity-40 cursor-not-allowed"
                          : "hover:bg-gray-800 cursor-pointer"
                      }`}
                    >
                      <div className="flex flex-col min-w-0">
                        <span
                          className={`font-medium ${disabled ? "text-gray-500" : "text-gray-200"}`}
                        >
                          {PANEL_TITLES[id]}
                          {id === "admin" && (
                            <span className="ml-1 text-[9px] text-orange-400">admin</span>
                          )}
                        </span>
                        <span className="text-gray-600 text-[10px] truncate">
                          {PANEL_DESCRIPTIONS[id]}
                        </span>
                      </div>
                      {!disabled && (
                        <span className="text-gray-500 shrink-0 text-[10px]" title="Drag to place">
                          ⠿
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

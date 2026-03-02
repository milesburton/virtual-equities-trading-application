import { useSignal } from "@preact/signals-react";
import type { PanelId } from "./DashboardLayout.tsx";
import { PANEL_IDS, PANEL_TITLES, useDashboard } from "./DashboardLayout.tsx";

export function ComponentPicker() {
  const open = useSignal(false);
  const { activePanelIds, addPanel, removePanel } = useDashboard();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          open.value = !open.value;
        }}
        title="Add / remove panels"
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 transition-colors px-1.5 py-0.5 rounded border border-gray-700 hover:border-gray-500"
      >
        <span className="text-sm leading-none">⊞</span>
        Panels
      </button>

      {open.value && (
        <>
          {/* Click-away backdrop */}
          <button
            type="button"
            aria-label="Close panel picker"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => {
              open.value = false;
            }}
          />

          <div className="absolute right-0 top-8 z-20 w-52 bg-gray-900 border border-gray-700 rounded shadow-xl text-xs">
            <div className="px-3 py-2 border-b border-gray-700 font-semibold text-gray-300 uppercase tracking-wider">
              Panels
            </div>
            <ul className="py-1">
              {PANEL_IDS.map((id: PanelId) => {
                const active = activePanelIds.has(id);
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (active) removePanel(id);
                        else addPanel(id);
                      }}
                      className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-gray-800 transition-colors text-left"
                    >
                      <span className={active ? "text-gray-200" : "text-gray-500"}>
                        {PANEL_TITLES[id]}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          active
                            ? "bg-emerald-900/50 text-emerald-400"
                            : "bg-gray-800 text-gray-600"
                        }`}
                      >
                        {active ? "visible" : "hidden"}
                      </span>
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

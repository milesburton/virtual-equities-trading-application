/**
 * TradingContext — thin wrapper for DOM-imperative operations only.
 * Strategy, side, and showShortcuts state have moved to uiSlice (Redux).
 * This context manages only the ticketRef (DOM element ref) which is
 * not serializable and must NOT go into Redux state.
 */
import { createContext, useCallback, useContext, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  hideShortcuts,
  setActiveSide,
  setActiveStrategy,
  toggleShortcuts,
} from "../store/uiSlice.ts";
import type { Strategy } from "../types.ts";

interface TradingContextValue {
  focusTicket: () => void;
  registerTicketRef: (ref: HTMLElement | null) => void;
}

const TradingContext = createContext<TradingContextValue | null>(null);

const STRATEGIES: Strategy[] = ["LIMIT", "TWAP", "POV", "VWAP"];

export function TradingProvider({ children }: { children: React.ReactNode }) {
  const ticketRef = useRef<HTMLElement | null>(null);
  const dispatch = useAppDispatch();
  const showShortcuts = useAppSelector((s) => s.ui.showShortcuts);

  const focusTicket = useCallback(() => {
    ticketRef.current?.focus();
  }, []);

  const registerTicketRef = useCallback((ref: HTMLElement | null) => {
    ticketRef.current = ref;
  }, []);

  const activeStrategy = useAppSelector((s) => s.ui.activeStrategy);

  useHotkeys("f,n", focusTicket, { preventDefault: true });
  useHotkeys("b", () => dispatch(setActiveSide("BUY")), { preventDefault: true });
  useHotkeys("s", () => dispatch(setActiveSide("SELL")), { preventDefault: true });
  useHotkeys(
    "tab",
    () => {
      const idx = STRATEGIES.indexOf(activeStrategy);
      dispatch(setActiveStrategy(STRATEGIES[(idx + 1) % STRATEGIES.length]));
    },
    { preventDefault: true }
  );
  useHotkeys("shift+?", () => dispatch(toggleShortcuts()), { preventDefault: true });
  useHotkeys("escape", () => dispatch(hideShortcuts()), { preventDefault: false });

  return (
    <TradingContext.Provider value={{ focusTicket, registerTicketRef }}>
      {children}
      {showShortcuts && <ShortcutOverlay onClose={() => dispatch(hideShortcuts())} />}
    </TradingContext.Provider>
  );
}

export function useTradingContext() {
  const ctx = useContext(TradingContext);
  if (!ctx) throw new Error("useTradingContext must be used inside TradingProvider");
  return ctx;
}

function ShortcutOverlay({ onClose }: { onClose: () => void }) {
  const shortcuts = [
    { key: "F / N", desc: "Focus order ticket" },
    { key: "B", desc: "Set side to BUY" },
    { key: "S", desc: "Set side to SELL" },
    { key: "Tab", desc: "Cycle strategy" },
    { key: "Ctrl+Enter", desc: "Submit order" },
    { key: "Escape", desc: "Close / clear" },
    { key: "?", desc: "Toggle this overlay" },
  ];

  return (
    <>
      <button
        type="button"
        aria-label="Close shortcuts overlay"
        className="fixed inset-0 z-40 bg-black/60 cursor-default"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-6 w-80 pointer-events-auto">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-gray-200 uppercase tracking-wider">
              Keyboard Shortcuts
            </span>
            <button
              type="button"
              onClick={onClose}
              title="Close shortcuts overlay (Escape)"
              aria-label="Close keyboard shortcuts overlay"
              className="text-gray-500 hover:text-gray-300 text-lg leading-none"
            >
              ×
            </button>
          </div>
          <table className="w-full text-xs">
            <tbody>
              {shortcuts.map((s) => (
                <tr key={s.key} className="border-b border-gray-800/60">
                  <td className="py-1.5 pr-4">
                    <kbd className="px-1.5 py-0.5 bg-gray-800 border border-gray-600 rounded text-gray-200 font-mono">
                      {s.key}
                    </kbd>
                  </td>
                  <td className="py-1.5 text-gray-400">{s.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

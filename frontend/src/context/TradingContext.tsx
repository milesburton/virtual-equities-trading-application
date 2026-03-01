import { createContext, useCallback, useContext, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import type { Strategy } from "../types.ts";

interface TradingContextValue {
  focusTicket: () => void;
  registerTicketRef: (ref: HTMLElement | null) => void;
  showShortcuts: boolean;
  activeStrategy: Strategy;
  setActiveStrategy: (s: Strategy) => void;
  activeSide: "BUY" | "SELL";
  setActiveSide: (s: "BUY" | "SELL") => void;
}

const TradingContext = createContext<TradingContextValue | null>(null);

const STRATEGIES: Strategy[] = ["LIMIT", "TWAP", "POV", "VWAP"];

export function TradingProvider({ children }: { children: React.ReactNode }) {
  const ticketRef = useRef<HTMLElement | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [activeStrategy, setActiveStrategy] = useState<Strategy>("LIMIT");
  const [activeSide, setActiveSide] = useState<"BUY" | "SELL">("BUY");

  const focusTicket = useCallback(() => {
    ticketRef.current?.focus();
  }, []);

  const registerTicketRef = useCallback((ref: HTMLElement | null) => {
    ticketRef.current = ref;
  }, []);

  useHotkeys("f,n", focusTicket, { preventDefault: true });
  useHotkeys("b", () => setActiveSide("BUY"), { preventDefault: true });
  useHotkeys("s", () => setActiveSide("SELL"), { preventDefault: true });
  useHotkeys(
    "tab",
    () => {
      setActiveStrategy((prev) => {
        const idx = STRATEGIES.indexOf(prev);
        return STRATEGIES[(idx + 1) % STRATEGIES.length];
      });
    },
    { preventDefault: true }
  );
  useHotkeys("shift+?", () => setShowShortcuts((v) => !v), { preventDefault: true });
  useHotkeys("escape", () => setShowShortcuts(false), { preventDefault: false });

  return (
    <TradingContext.Provider
      value={{
        focusTicket,
        registerTicketRef,
        showShortcuts,
        activeStrategy,
        setActiveStrategy,
        activeSide,
        setActiveSide,
      }}
    >
      {children}
      {showShortcuts && <ShortcutOverlay onClose={() => setShowShortcuts(false)} />}
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

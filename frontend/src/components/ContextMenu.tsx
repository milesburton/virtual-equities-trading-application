import { useSignal } from "@preact/signals-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export interface ContextMenuItem {
  label: string;
  icon?: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}

export interface ContextMenuSeparator {
  separator: true;
  label?: string;
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator;

interface ContextMenuProps {
  items: ContextMenuEntry[];
  x: number;
  y: number;
  onClose: () => void;
}

function isSeparator(e: ContextMenuEntry): e is ContextMenuSeparator {
  return "separator" in e;
}

export function ContextMenu({ items, x, y, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Clamp position so menu doesn't overflow viewport
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const menuW = 200;
  const menuH = items.length * 30 + 16; // rough estimate
  const left = Math.min(x, vw - menuW - 8);
  const top = Math.min(y, vh - menuH - 8);

  useEffect(() => {
    function handleDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Context menu"
      style={{ top, left }}
      className="fixed z-[9999] min-w-[180px] max-w-[240px] bg-gray-900 border border-gray-700 rounded shadow-2xl py-1 text-xs select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((entry, i) => {
        if (isSeparator(entry)) {
          return (
            <div key={`sep-${entry.label ?? i}`} className="flex items-center gap-2 my-1">
              {entry.label && (
                <span className="text-[9px] text-gray-600 uppercase tracking-wider pl-3 whitespace-nowrap">
                  {entry.label}
                </span>
              )}
              <div className="flex-1 h-px bg-gray-800 mr-2" />
            </div>
          );
        }
        return (
          <button
            key={entry.label}
            role="menuitem"
            type="button"
            disabled={entry.disabled}
            title={entry.title}
            onClick={() => {
              if (!entry.disabled) {
                entry.onClick();
                onClose();
              }
            }}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
              entry.disabled
                ? "opacity-40 cursor-not-allowed text-gray-500"
                : entry.danger
                  ? "text-red-400 hover:bg-red-950/60 cursor-pointer"
                  : "text-gray-300 hover:bg-gray-800 cursor-pointer"
            }`}
          >
            {entry.icon && (
              <span className="w-4 text-center shrink-0 text-gray-500">{entry.icon}</span>
            )}
            <span className="flex-1">{entry.label}</span>
            {entry.shortcut && (
              <span className="text-[9px] text-gray-600 tabular-nums">{entry.shortcut}</span>
            )}
          </button>
        );
      })}
    </div>,
    document.body
  );
}

/** Hook for managing context menu state with signals */
export function useContextMenu() {
  const menu = useSignal<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);

  return {
    menu,
    openMenu(e: React.MouseEvent, items: ContextMenuEntry[]) {
      e.preventDefault();
      e.stopPropagation();
      menu.value = { x: e.clientX, y: e.clientY, items };
    },
    closeMenu() {
      menu.value = null;
    },
  };
}

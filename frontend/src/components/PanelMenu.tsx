import { useSignal } from "@preact/signals-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useChannelContext } from "../contexts/ChannelContext.tsx";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  panelClosed,
  panelDialogClosed,
  panelDialogOpened,
  panelPopped,
} from "../store/windowSlice.ts";
import { useDashboard } from "./DashboardLayout.tsx";

/**
 * Panel action menu — replaces the single pop-out button with a small dropdown.
 * Provides "Open in new window" and "Open in dialog" actions.
 *
 * panelId should be the FlexLayout node instance ID (from ChannelContext.instanceId)
 * or a stable identifier for singleton panels.
 */
export function PanelMenu({ panelId }: { panelId?: string }) {
  const dispatch = useAppDispatch();
  const ctx = useChannelContext();
  const { storageKey } = useDashboard();
  const instanceId = panelId ?? ctx.instanceId;
  const panelType = ctx.panelType;

  const isPopOut = useAppSelector((s) => s.windows.popOuts[instanceId]?.open ?? false);
  const isDialog = useAppSelector((s) => s.windows.dialogs[instanceId]?.open ?? false);

  const open = useSignal(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open.value) return;
    function handler(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        open.value = false;
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open.value, open]);

  // Close on Escape
  useEffect(() => {
    if (!open.value) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") open.value = false;
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open.value, open]);

  function openNewWindow() {
    open.value = false;
    const params = new URLSearchParams({ panel: instanceId, type: panelType, layout: storageKey });
    const url = `${window.location.origin}${window.location.pathname}?${params}`;
    const w = window.open(url, `panel-${instanceId}`, "width=1200,height=700,resizable=yes");
    if (w) {
      dispatch(panelPopped({ panelId: instanceId }));
      const interval = setInterval(() => {
        if (w.closed) {
          clearInterval(interval);
          dispatch(panelClosed({ panelId: instanceId }));
        }
      }, 500);
    }
  }

  function openDialog() {
    open.value = false;
    dispatch(panelDialogOpened({ panelId: instanceId, panelType }));
  }

  function closeDialog() {
    dispatch(panelDialogClosed({ panelId: instanceId }));
  }

  const isActive = isPopOut || isDialog;

  // Calculate menu position from button
  const menuStyle = (): React.CSSProperties => {
    if (!btnRef.current) return { top: 0, right: 0 };
    const r = btnRef.current.getBoundingClientRect();
    return {
      position: "fixed",
      top: r.bottom + 4,
      right: window.innerWidth - r.right,
      zIndex: 9999,
    };
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          open.value = !open.value;
        }}
        title="Panel actions: open in new window or dialog"
        aria-label="Panel actions"
        aria-haspopup="menu"
        aria-expanded={open.value}
        className={`text-xs transition-colors ${isActive ? "text-sky-400" : "text-gray-600 hover:text-gray-300"} disabled:opacity-30`}
      >
        ⬡
      </button>

      {open.value &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="Panel actions menu"
            style={menuStyle()}
            className="bg-gray-900 border border-gray-700 rounded shadow-xl py-1 min-w-[160px]"
          >
            <button
              role="menuitem"
              type="button"
              disabled={isPopOut}
              onClick={openNewWindow}
              title={
                isPopOut
                  ? "Already open in a separate window"
                  : "Open this panel in a new browser window"
              }
              className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <span aria-hidden="true">↗</span>
              New window
            </button>
            <button
              role="menuitem"
              type="button"
              disabled={isDialog}
              onClick={openDialog}
              title={
                isDialog
                  ? "Already open in a dialog"
                  : "Open this panel in a floating dialog overlay"
              }
              className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <span aria-hidden="true">□</span>
              Open in dialog
            </button>
            {isDialog && (
              <>
                <hr className="border-t border-gray-700 my-1" />
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    open.value = false;
                    closeDialog();
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-gray-700 flex items-center gap-2"
                >
                  <span aria-hidden="true">✕</span>
                  Close dialog
                </button>
              </>
            )}
          </div>,
          document.body
        )}
    </>
  );
}

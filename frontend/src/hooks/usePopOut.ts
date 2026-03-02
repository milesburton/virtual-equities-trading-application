import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import type { PanelId } from "../store/windowSlice.ts";
import { panelClosed, panelPopped } from "../store/windowSlice.ts";

export function usePopOut(panelId: PanelId): {
  isPopOut: boolean;
  popOut: () => void;
  closePopOut: () => void;
} {
  const dispatch = useAppDispatch();
  const isPopOut = useAppSelector((s) => s.windows.popOuts[panelId].open);

  function popOut() {
    const url = `${window.location.origin}${window.location.pathname}?panel=${panelId}`;
    const w = window.open(url, `panel-${panelId}`, "width=1200,height=700,resizable=yes");
    if (w) {
      dispatch(panelPopped({ panelId }));
      // Poll for window close so we can restore the placeholder
      const interval = setInterval(() => {
        if (w.closed) {
          clearInterval(interval);
          dispatch(panelClosed({ panelId }));
        }
      }, 500);
    }
  }

  function closePopOut() {
    dispatch(panelClosed({ panelId }));
  }

  return { isPopOut, popOut, closePopOut };
}

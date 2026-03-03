import { useDashboard } from "../components/DashboardLayout.tsx";
import { useChannelContext } from "../contexts/ChannelContext.tsx";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { panelClosed, panelPopped } from "../store/windowSlice.ts";

/**
 * Provides pop-out functionality for a panel instance.
 * The instanceId comes from ChannelContext, so the hook works for
 * any panel regardless of how many instances exist.
 * Pass `overrideId` when using outside of a ChannelContext (e.g. legacy callers).
 */
export function usePopOut(overrideId?: string): {
  isPopOut: boolean;
  popOut: () => void;
  closePopOut: () => void;
} {
  const dispatch = useAppDispatch();
  const ctx = useChannelContext();
  const { storageKey } = useDashboard();
  const instanceId = overrideId ?? ctx.instanceId;
  const panelType = ctx.panelType;

  const isPopOut = useAppSelector((s) => s.windows.popOuts[instanceId]?.open ?? false);

  function popOut() {
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

  function closePopOut() {
    dispatch(panelClosed({ panelId: instanceId }));
  }

  return { isPopOut, popOut, closePopOut };
}

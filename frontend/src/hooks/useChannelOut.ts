import { useCallback } from "react";
import { useChannelContext } from "../contexts/ChannelContext.tsx";
import type { ChannelData } from "../store/channelsSlice.ts";
import { channelUpdated } from "../store/channelsSlice.ts";
import { useAppDispatch } from "../store/hooks.ts";
import { setSelectedAsset } from "../store/uiSlice.ts";

/**
 * Returns a broadcast function for the panel's outgoing channel.
 * If no outgoing channel is configured, falls back to the legacy
 * ui.selectedAsset action so unconfigured panels still work.
 */
export function useChannelOut(): (patch: Partial<ChannelData>) => void {
  const { outgoing } = useChannelContext();
  const dispatch = useAppDispatch();

  return useCallback(
    (patch: Partial<ChannelData>) => {
      if (outgoing !== null) {
        dispatch(channelUpdated({ channel: outgoing, patch }));
      } else {
        // Legacy fallback: write directly to ui.selectedAsset
        if ("selectedAsset" in patch) {
          dispatch(setSelectedAsset(patch.selectedAsset ?? null));
        }
      }
    },
    [outgoing, dispatch]
  );
}

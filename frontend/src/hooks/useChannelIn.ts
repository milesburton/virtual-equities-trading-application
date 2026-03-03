import { useChannelContext } from "../contexts/ChannelContext.tsx";
import type { ChannelData } from "../store/channelsSlice.ts";
import { useAppSelector } from "../store/hooks.ts";

/**
 * Returns the current data from the panel's incoming channel.
 * Falls back to legacy ui.selectedAsset when no incoming channel is configured.
 */
export function useChannelIn(): ChannelData {
  const { incoming } = useChannelContext();
  const channelData = useAppSelector((s) => (incoming !== null ? s.channels.data[incoming] : null));
  const legacyAsset = useAppSelector((s) => s.ui.selectedAsset);

  if (incoming !== null && channelData) {
    return channelData;
  }

  // Fallback: legacy global selection
  return { selectedAsset: legacyAsset, selectedOrderId: null };
}

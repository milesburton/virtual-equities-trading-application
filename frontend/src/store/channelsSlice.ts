import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";

export type ChannelNumber = 1 | 2 | 3 | 4 | 5 | 6;

export interface ChannelData {
  selectedAsset: string | null;
  selectedOrderId: string | null;
}

interface ChannelsState {
  /** Live data on each channel — what's currently "selected" on that channel */
  data: Record<number, ChannelData>;
}

const emptyChannel = (): ChannelData => ({ selectedAsset: null, selectedOrderId: null });

const initialState: ChannelsState = {
  data: {
    1: emptyChannel(),
    2: emptyChannel(),
    3: emptyChannel(),
    4: emptyChannel(),
    5: emptyChannel(),
    6: emptyChannel(),
  },
};

export const channelsSlice = createSlice({
  name: "channels",
  initialState,
  reducers: {
    channelUpdated(
      state,
      action: PayloadAction<{ channel: ChannelNumber; patch: Partial<ChannelData> }>
    ) {
      const { channel, patch } = action.payload;
      const existing = state.data[channel] ?? emptyChannel();
      state.data[channel] = { ...existing, ...patch };
    },
    channelCleared(state, action: PayloadAction<{ channel: ChannelNumber }>) {
      state.data[action.payload.channel] = emptyChannel();
    },
  },
});

export const { channelUpdated, channelCleared } = channelsSlice.actions;

import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";

// String-keyed by instance ID so any panel (including multi-instances) can pop out
interface WindowState {
  popOuts: Record<string, { open: boolean }>;
}

const initialState: WindowState = {
  popOuts: {},
};

export const windowSlice = createSlice({
  name: "windows",
  initialState,
  reducers: {
    panelPopped(state, action: PayloadAction<{ panelId: string }>) {
      state.popOuts[action.payload.panelId] = { open: true };
    },
    panelClosed(state, action: PayloadAction<{ panelId: string }>) {
      if (state.popOuts[action.payload.panelId]) {
        state.popOuts[action.payload.panelId].open = false;
      }
    },
  },
});

export const { panelPopped, panelClosed } = windowSlice.actions;

// Keep PanelId alias for any code that imported it from here
export type PanelId = string;

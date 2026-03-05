import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";

// String-keyed by instance ID so any panel (including multi-instances) can pop out or open in dialog
interface WindowState {
  popOuts: Record<string, { open: boolean }>;
  dialogs: Record<string, { open: boolean; panelType: string }>;
}

const initialState: WindowState = {
  popOuts: {},
  dialogs: {},
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
    panelDialogOpened(state, action: PayloadAction<{ panelId: string; panelType: string }>) {
      state.dialogs[action.payload.panelId] = { open: true, panelType: action.payload.panelType };
    },
    panelDialogClosed(state, action: PayloadAction<{ panelId: string }>) {
      if (state.dialogs[action.payload.panelId]) {
        state.dialogs[action.payload.panelId].open = false;
      }
    },
  },
});

export const { panelPopped, panelClosed, panelDialogOpened, panelDialogClosed } =
  windowSlice.actions;

// Keep PanelId alias for any code that imported it from here
export type PanelId = string;

import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";

export type PanelId = "order-blotter" | "algo-monitor" | "observability" | "market-ladder";

const ALL_PANELS: PanelId[] = ["order-blotter", "algo-monitor", "observability", "market-ladder"];

interface WindowState {
  popOuts: Record<PanelId, { open: boolean }>;
}

const initialState: WindowState = {
  popOuts: Object.fromEntries(ALL_PANELS.map((id) => [id, { open: false }])) as Record<
    PanelId,
    { open: boolean }
  >,
};

export const windowSlice = createSlice({
  name: "windows",
  initialState,
  reducers: {
    panelPopped(state, action: PayloadAction<{ panelId: PanelId }>) {
      state.popOuts[action.payload.panelId].open = true;
    },
    panelClosed(state, action: PayloadAction<{ panelId: PanelId }>) {
      state.popOuts[action.payload.panelId].open = false;
    },
  },
});

export const { panelPopped, panelClosed } = windowSlice.actions;

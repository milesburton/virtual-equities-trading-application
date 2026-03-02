import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import type { Strategy } from "../types.ts";

interface UiState {
  activeStrategy: Strategy;
  activeSide: "BUY" | "SELL";
  showShortcuts: boolean;
  selectedAsset: string | null;
}

const initialState: UiState = {
  activeStrategy: "LIMIT",
  activeSide: "BUY",
  showShortcuts: false,
  selectedAsset: null,
};

export const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    setActiveStrategy(state, action: PayloadAction<Strategy>) {
      state.activeStrategy = action.payload;
    },
    setActiveSide(state, action: PayloadAction<"BUY" | "SELL">) {
      state.activeSide = action.payload;
    },
    toggleShortcuts(state) {
      state.showShortcuts = !state.showShortcuts;
    },
    hideShortcuts(state) {
      state.showShortcuts = false;
    },
    setSelectedAsset(state, action: PayloadAction<string | null>) {
      state.selectedAsset = action.payload;
    },
  },
});

export const { setActiveStrategy, setActiveSide, toggleShortcuts, hideShortcuts, setSelectedAsset } =
  uiSlice.actions;

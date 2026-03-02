import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import type { ObsEvent } from "../types.ts";

interface ObservabilityState {
  events: ObsEvent[];
}

const initialState: ObservabilityState = { events: [] };

export const observabilitySlice = createSlice({
  name: "observability",
  initialState,
  reducers: {
    historicEventsLoaded(state, action: PayloadAction<ObsEvent[]>) {
      state.events = action.payload;
    },
    eventReceived(state, action: PayloadAction<ObsEvent>) {
      state.events = [action.payload, ...state.events].slice(0, 1000);
    },
  },
});

export const { historicEventsLoaded, eventReceived } = observabilitySlice.actions;

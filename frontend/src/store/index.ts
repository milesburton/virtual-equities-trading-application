import { configureStore } from "@reduxjs/toolkit";
import { createBroadcastChannelMiddleware } from "./channel.ts";
import { marketSlice } from "./marketSlice.ts";
import { fixMiddleware } from "./middleware/fixMiddleware.ts";
import { marketFeedMiddleware } from "./middleware/marketFeedMiddleware.ts";
import { observabilityMiddleware } from "./middleware/observabilityMiddleware.ts";
import { simulationMiddleware } from "./middleware/simulationMiddleware.ts";
import { versionWatchMiddleware } from "./middleware/versionWatchMiddleware.ts";
import { obsApi } from "./obsApi.ts";
import { observabilitySlice } from "./observabilitySlice.ts";
import { ordersSlice } from "./ordersSlice.ts";
import { servicesApi } from "./servicesApi.ts";
import { uiSlice } from "./uiSlice.ts";
import { windowSlice } from "./windowSlice.ts";

export const store = configureStore({
  reducer: {
    market: marketSlice.reducer,
    orders: ordersSlice.reducer,
    observability: observabilitySlice.reducer,
    ui: uiSlice.reducer,
    windows: windowSlice.reducer,
    [servicesApi.reducerPath]: servicesApi.reducer,
    [obsApi.reducerPath]: obsApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware()
      .concat(servicesApi.middleware)
      .concat(obsApi.middleware)
      .concat(marketFeedMiddleware)
      .concat(fixMiddleware)
      .concat(observabilityMiddleware)
      .concat(simulationMiddleware.middleware)
      .concat(versionWatchMiddleware)
      .concat(createBroadcastChannelMiddleware()),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

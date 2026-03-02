import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { vi } from "vitest";
import { marketSlice } from "../../store/marketSlice";
import { uiSlice } from "../../store/uiSlice";
import { windowSlice } from "../../store/windowSlice";
import { servicesApi } from "../../store/servicesApi";
import { StatusBar } from "../StatusBar";

// Stub the RTK Query hook so the test doesn't need a real HTTP server
vi.mock("../../store/servicesApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../store/servicesApi")>();
  return {
    ...original,
    useGetServiceHealthQuery: () => ({
      data: undefined,
      isError: false,
      isLoading: true,
    }),
  };
});

function makeStore(connected: boolean) {
  return configureStore({
    reducer: {
      market: marketSlice.reducer,
      ui: uiSlice.reducer,
      windows: windowSlice.reducer,
      [servicesApi.reducerPath]: servicesApi.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(servicesApi.middleware),
    preloadedState: {
      market: {
        assets: [],
        prices: {},
        priceHistory: {},
        candleHistory: {},
        connected,
      },
    },
  });
}

test("shows LIVE when connected and shows time", () => {
  render(
    <Provider store={makeStore(true)}>
      <StatusBar />
    </Provider>
  );
  expect(screen.getByText(/Market Feed LIVE/)).toBeInTheDocument();
  expect(screen.getByText(/Equities Market Emulator/)).toBeInTheDocument();
  // time element should exist
  expect(screen.getByText(/:/)).toBeInTheDocument();
});

test("shows DISCONNECTED when not connected", () => {
  render(
    <Provider store={makeStore(false)}>
      <StatusBar />
    </Provider>
  );
  expect(screen.getByText(/DISCONNECTED/)).toBeInTheDocument();
});

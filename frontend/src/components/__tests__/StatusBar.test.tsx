import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { vi } from "vitest";
import { authSlice } from "../../store/authSlice";
import { marketSlice } from "../../store/marketSlice";
import { servicesApi } from "../../store/servicesApi";
import { uiSlice } from "../../store/uiSlice";
import { windowSlice } from "../../store/windowSlice";
import { DashboardContext } from "../DashboardLayout";
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
      auth: authSlice.reducer,
      market: marketSlice.reducer,
      ui: uiSlice.reducer,
      windows: windowSlice.reducer,
      [servicesApi.reducerPath]: servicesApi.reducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(servicesApi.middleware),
    preloadedState: {
      market: {
        assets: [],
        prices: {},
        priceHistory: {},
        candleHistory: {},
        connected,
        orderBook: {},
      },
    },
  });
}

function renderBar(connected: boolean, resetLayout = vi.fn()) {
  return render(
    <Provider store={makeStore(connected)}>
      <DashboardContext.Provider
        value={{
          activePanelIds: new Set(),
          addPanel: vi.fn(),
          removePanel: vi.fn(),
          resetLayout,
          storageKey: "dashboard-layout",
        }}
      >
        <StatusBar />
      </DashboardContext.Provider>
    </Provider>
  );
}

test("shows LIVE when connected and shows time", () => {
  renderBar(true);
  expect(screen.getByText(/Market Feed LIVE/)).toBeInTheDocument();
  expect(screen.getByText(/Equities Market Emulator/)).toBeInTheDocument();
  // time element should exist
  expect(screen.getByText(/:/)).toBeInTheDocument();
});

test("shows DISCONNECTED when not connected", () => {
  renderBar(false);
  expect(screen.getByText(/DISCONNECTED/)).toBeInTheDocument();
});

test("reset layout button calls resetLayout", () => {
  const resetLayout = vi.fn();
  renderBar(true, resetLayout);
  fireEvent.click(screen.getByRole("button", { name: /reset layout/i }));
  expect(resetLayout).toHaveBeenCalledTimes(1);
});

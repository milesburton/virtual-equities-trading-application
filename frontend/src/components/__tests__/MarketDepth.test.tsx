import { configureStore } from "@reduxjs/toolkit";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";
import { marketSlice } from "../../store/marketSlice";
import { ordersSlice } from "../../store/ordersSlice";
import { uiSlice } from "../../store/uiSlice";
import { windowSlice } from "../../store/windowSlice";
import type { OrderBookSnapshot } from "../../types";
import { MarketDepth } from "../MarketDepth";

// lightweight-charts renders to canvas — stub it
vi.mock("lightweight-charts", () => {
  const seriesStub = { setData: vi.fn(), applyOptions: vi.fn() };
  const chartStub = {
    addSeries: vi.fn(() => seriesStub),
    priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
    applyOptions: vi.fn(),
    timeScale: vi.fn(() => ({ fitContent: vi.fn(), visible: false })),
    remove: vi.fn(),
  };
  return {
    createChart: vi.fn(() => chartStub),
    HistogramSeries: {},
    ColorType: { Solid: "solid" },
  };
});

const mockSnapshot: OrderBookSnapshot = {
  mid: 180.25,
  ts: Date.now(),
  bids: Array.from({ length: 10 }, (_, i) => ({ price: 180.25 - i * 0.01, size: 1000 - i * 80 })),
  asks: Array.from({ length: 10 }, (_, i) => ({ price: 180.26 + i * 0.01, size: 1000 - i * 80 })),
};

function makeStore(orderBook: Record<string, OrderBookSnapshot> = {}) {
  return configureStore({
    reducer: {
      market: marketSlice.reducer,
      orders: ordersSlice.reducer,
      ui: uiSlice.reducer,
      windows: windowSlice.reducer,
    },
    preloadedState: {
      market: {
        assets: [],
        prices: {},
        priceHistory: {},
        candleHistory: {},
        candlesReady: {},
        orderBook,
        connected: true,
      },
    },
  });
}

describe("MarketDepth – no data", () => {
  it("shows waiting message when no snapshot available", () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <MarketDepth symbol="AAPL" />
      </Provider>
    );
    expect(screen.getByText(/No depth data for AAPL/i)).toBeInTheDocument();
  });
});

describe("MarketDepth – with data", () => {
  it("shows mid price when snapshot is present", () => {
    const store = makeStore({ AAPL: mockSnapshot });
    render(
      <Provider store={store}>
        <MarketDepth symbol="AAPL" />
      </Provider>
    );
    // Mid price appears in the spread indicator (title attribute) and bid levels
    const midEl = screen.getByTitle("Mid price — midpoint between best bid and ask");
    expect(midEl).toHaveTextContent("180.25");
  });

  it("does not show waiting message when data is present", () => {
    const store = makeStore({ AAPL: mockSnapshot });
    render(
      <Provider store={store}>
        <MarketDepth symbol="AAPL" />
      </Provider>
    );
    expect(screen.queryByText(/No depth data/i)).not.toBeInTheDocument();
  });
});

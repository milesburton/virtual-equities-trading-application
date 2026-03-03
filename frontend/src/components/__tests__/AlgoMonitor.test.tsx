import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";
import { ChannelContext } from "../../contexts/ChannelContext";
import { channelsSlice } from "../../store/channelsSlice";
import { marketSlice } from "../../store/marketSlice";
import { ordersSlice } from "../../store/ordersSlice";
import { uiSlice } from "../../store/uiSlice";
import { windowSlice } from "../../store/windowSlice";
import type { MarketPrices, OrderRecord } from "../../types";
import { AlgoMonitor } from "../AlgoMonitor";

const now = Date.now();

function makeOrder(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: "order-1",
    submittedAt: now,
    asset: "AAPL",
    side: "BUY",
    quantity: 100,
    limitPrice: 150,
    expiresAt: now + 60_000,
    strategy: "TWAP",
    status: "executing",
    filled: 25,
    algoParams: { strategy: "TWAP", numSlices: 4, participationCap: 25 },
    children: [],
    ...overrides,
  };
}

function makeStore(orders: OrderRecord[] = [], prices: MarketPrices = {}) {
  return configureStore({
    reducer: {
      orders: ordersSlice.reducer,
      market: marketSlice.reducer,
      windows: windowSlice.reducer,
      ui: uiSlice.reducer,
      channels: channelsSlice.reducer,
    },
    preloadedState: {
      orders: { orders },
      market: {
        assets: [],
        prices,
        priceHistory: {},
        candleHistory: {},
        connected: false,
        orderBook: {},
      },
    },
  });
}

function renderMonitor(orders: OrderRecord[] = [], prices: MarketPrices = {}) {
  return render(
    <Provider store={makeStore(orders, prices)}>
      <ChannelContext.Provider
        value={{
          instanceId: "algo-monitor",
          panelType: "algo-monitor",
          outgoing: null,
          incoming: null,
        }}
      >
        <AlgoMonitor />
      </ChannelContext.Provider>
    </Provider>
  );
}

// ── Active tab (default) ──────────────────────────────────────────────────────

describe("AlgoMonitor – Active tab (default)", () => {
  it("shows empty message when there are no active orders", () => {
    renderMonitor([]);
    expect(screen.getByText(/No active algo orders/i)).toBeInTheDocument();
  });

  it("hides filled and expired orders from active list", () => {
    const orders = [
      makeOrder({ status: "filled" }),
      makeOrder({ id: "order-2", status: "expired" }),
    ];
    renderMonitor(orders);
    expect(screen.getByText(/No active algo orders/i)).toBeInTheDocument();
  });

  it("renders an executing order with asset, side, strategy", () => {
    renderMonitor([makeOrder()]);
    expect(screen.getByText("AAPL")).toBeInTheDocument();
    expect(screen.getByText("BUY")).toBeInTheDocument();
    // TWAP appears in the dropdown option AND the table cell
    expect(screen.getAllByText("TWAP").length).toBeGreaterThanOrEqual(1);
  });

  it("shows queued order as 'Waiting'", () => {
    renderMonitor([makeOrder({ status: "queued", filled: 0 })]);
    expect(screen.getByText("Waiting")).toBeInTheDocument();
  });

  it("shows LIMIT executing order as 'Monitoring'", () => {
    renderMonitor([
      makeOrder({
        strategy: "LIMIT",
        status: "executing",
        algoParams: { strategy: "LIMIT" },
      }),
    ]);
    expect(screen.getByText("Monitoring")).toBeInTheDocument();
  });

  it("shows seconds remaining for non-LIMIT executing orders", () => {
    renderMonitor([makeOrder({ expiresAt: now + 30_000 })]);
    expect(screen.getByText(/\d+s left/)).toBeInTheDocument();
  });

  it("calculates and displays fill percentage", () => {
    renderMonitor([makeOrder({ quantity: 100, filled: 50 })]);
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("renders filled quantity", () => {
    renderMonitor([makeOrder({ filled: 25 })]);
    expect(screen.getByText("25")).toBeInTheDocument();
  });

  it("shows unfilled quantity", () => {
    // quantity=100, filled=25 → unfilled=75
    renderMonitor([makeOrder({ quantity: 100, filled: 25 })]);
    expect(screen.getByText("75")).toBeInTheDocument();
  });

  it("shows limit price column", () => {
    renderMonitor([makeOrder({ limitPrice: 150 })]);
    expect(screen.getByText("150.00")).toBeInTheDocument();
  });

  it("shows current market price when available", () => {
    renderMonitor([makeOrder()], { AAPL: 148.5 });
    expect(screen.getByText("148.50")).toBeInTheDocument();
  });
});

// ── Needs Action tab ──────────────────────────────────────────────────────────

describe("AlgoMonitor – Needs Action tab", () => {
  function clickNeedsAction() {
    fireEvent.click(screen.getByText(/Needs Action/));
  }

  it("shows empty message when no orders need action", () => {
    renderMonitor([makeOrder()]);
    clickNeedsAction();
    expect(screen.getByText(/No orders need attention/i)).toBeInTheDocument();
  });

  it("shows expired partially-filled order in Needs Action tab", () => {
    const order = makeOrder({ status: "expired", filled: 40, quantity: 100 });
    renderMonitor([order]);
    clickNeedsAction();
    expect(screen.getByText("AAPL")).toBeInTheDocument();
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("does NOT show fully-filled expired order in Needs Action tab", () => {
    const order = makeOrder({ status: "expired", filled: 100, quantity: 100 });
    renderMonitor([order]);
    clickNeedsAction();
    expect(screen.getByText(/No orders need attention/i)).toBeInTheDocument();
  });

  it("shows unfilled quantity for partial order", () => {
    const order = makeOrder({ status: "expired", filled: 40, quantity: 100 });
    renderMonitor([order]);
    clickNeedsAction();
    // unfilled = 60
    expect(screen.getByText("60")).toBeInTheDocument();
  });

  it("renders badge count on Needs Action tab button", () => {
    const order = makeOrder({ status: "expired", filled: 40, quantity: 100 });
    renderMonitor([order]);
    // The badge should show "1" beside "Needs Action"
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("shows 'Trade at Last' button for expired partial order with market price", () => {
    const order = makeOrder({ status: "expired", filled: 40, quantity: 100 });
    renderMonitor([order], { AAPL: 148 });
    clickNeedsAction();
    expect(screen.getByRole("button", { name: /Trade at Last/i })).toBeInTheDocument();
  });

  it("does NOT show 'Trade at Last' button when market price is unavailable", () => {
    const order = makeOrder({ status: "expired", filled: 40, quantity: 100 });
    renderMonitor([order], {}); // no price
    clickNeedsAction();
    expect(screen.queryByRole("button", { name: /Trade at Last/i })).not.toBeInTheDocument();
  });

  it("dispatches submitOrderThunk when Trade at Last is clicked", () => {
    const order = makeOrder({
      id: "o1",
      status: "expired",
      filled: 40,
      quantity: 100,
      asset: "AAPL",
      side: "BUY",
    });
    const store = makeStore([order], { AAPL: 148 });
    const dispatchSpy = vi.spyOn(store, "dispatch");

    render(
      <Provider store={store}>
        <ChannelContext.Provider
          value={{
            instanceId: "algo-monitor",
            panelType: "algo-monitor",
            outgoing: null,
            incoming: null,
          }}
        >
          <AlgoMonitor />
        </ChannelContext.Provider>
      </Provider>
    );

    fireEvent.click(screen.getByText(/Needs Action/));
    fireEvent.click(screen.getByRole("button", { name: /Trade at Last/i }));

    // A thunk was dispatched (it's a function)
    const thunkCalls = dispatchSpy.mock.calls.filter(([arg]) => typeof arg === "function");
    expect(thunkCalls.length).toBeGreaterThan(0);
  });
});

// ── Strategy filter ───────────────────────────────────────────────────────────

describe("AlgoMonitor – strategy filter", () => {
  const orders = [
    makeOrder({
      id: "1",
      strategy: "TWAP",
      asset: "AAPL",
      algoParams: { strategy: "TWAP", numSlices: 4, participationCap: 25 },
    }),
    makeOrder({
      id: "2",
      strategy: "POV",
      asset: "MSFT",
      algoParams: { strategy: "POV", participationRate: 10, minSliceSize: 1, maxSliceSize: 500 },
    }),
    makeOrder({ id: "3", strategy: "LIMIT", asset: "GOOGL", algoParams: { strategy: "LIMIT" } }),
  ];

  it("shows all orders when filter is ALL", () => {
    renderMonitor(orders);
    expect(screen.getByText("AAPL")).toBeInTheDocument();
    expect(screen.getByText("MSFT")).toBeInTheDocument();
    expect(screen.getByText("GOOGL")).toBeInTheDocument();
  });

  it("filters to show only TWAP orders", () => {
    renderMonitor(orders);
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "TWAP" } });

    expect(screen.getByText("AAPL")).toBeInTheDocument();
    expect(screen.queryByText("MSFT")).not.toBeInTheDocument();
    expect(screen.queryByText("GOOGL")).not.toBeInTheDocument();
  });

  it("filters to show only POV orders", () => {
    renderMonitor(orders);
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "POV" } });

    expect(screen.queryByText("AAPL")).not.toBeInTheDocument();
    expect(screen.getByText("MSFT")).toBeInTheDocument();
    expect(screen.queryByText("GOOGL")).not.toBeInTheDocument();
  });
});

// ── Child orders ──────────────────────────────────────────────────────────────

describe("AlgoMonitor – child orders", () => {
  const child = {
    id: "child-1",
    parentId: "order-1",
    asset: "AAPL",
    side: "BUY" as const,
    quantity: 25,
    limitPrice: 150,
    status: "filled" as const,
    filled: 25,
    submittedAt: now,
  };

  it("renders child order rows when present", () => {
    renderMonitor([makeOrder({ children: [child] })]);
    expect(screen.getByText("child")).toBeInTheDocument();
  });
});

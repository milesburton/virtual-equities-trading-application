import { configureStore } from "@reduxjs/toolkit";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it } from "vitest";
import { ChannelContext } from "../../contexts/ChannelContext";
import { channelsSlice } from "../../store/channelsSlice";
import { marketSlice } from "../../store/marketSlice";
import { ordersSlice } from "../../store/ordersSlice";
import { uiSlice } from "../../store/uiSlice";
import { windowSlice } from "../../store/windowSlice";
import type { OrderRecord } from "../../types";
import { OrderProgressPanel } from "../OrderProgressPanel";

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
    filled: 50,
    algoParams: { strategy: "TWAP", numSlices: 4, participationCap: 25 },
    children: [],
    ...overrides,
  };
}

function makeStore(orders: OrderRecord[] = [], selectedOrderId: string | null = null) {
  return configureStore({
    reducer: {
      orders: ordersSlice.reducer,
      market: marketSlice.reducer,
      ui: uiSlice.reducer,
      channels: channelsSlice.reducer,
      windows: windowSlice.reducer,
    },
    preloadedState: {
      orders: { orders },
      channels: {
        data: {
          1: { selectedAsset: null, selectedOrderId: null },
          2: { selectedAsset: null, selectedOrderId },
          3: { selectedAsset: null, selectedOrderId: null },
          4: { selectedAsset: null, selectedOrderId: null },
          5: { selectedAsset: null, selectedOrderId: null },
          6: { selectedAsset: null, selectedOrderId: null },
        },
      },
    },
  });
}

function renderPanel(orders: OrderRecord[] = [], selectedOrderId: string | null = null) {
  const store = makeStore(orders, selectedOrderId);
  return render(
    <Provider store={store}>
      <ChannelContext.Provider
        value={{ instanceId: "test", panelType: "order-progress", outgoing: null, incoming: 2 }}
      >
        <OrderProgressPanel />
      </ChannelContext.Provider>
    </Provider>
  );
}

describe("OrderProgressPanel", () => {
  it("shows empty state when no order is selected", () => {
    renderPanel([makeOrder()]);
    expect(screen.getByText(/Select an order in the blotter/i)).toBeInTheDocument();
  });

  it("shows empty state when selected order does not exist", () => {
    renderPanel([], "nonexistent-id");
    expect(screen.getByText(/Select an order in the blotter/i)).toBeInTheDocument();
  });

  it("shows fill percentage for the selected order", () => {
    renderPanel([makeOrder({ id: "order-1", filled: 50, quantity: 100 })], "order-1");
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("shows order details in the header", () => {
    renderPanel([makeOrder({ id: "order-1" })], "order-1");
    expect(screen.getByText(/AAPL/)).toBeInTheDocument();
    expect(screen.getByText(/TWAP/)).toBeInTheDocument();
  });

  it("shows 100% for a fully filled order", () => {
    renderPanel(
      [makeOrder({ id: "order-1", filled: 100, quantity: 100, status: "filled" })],
      "order-1"
    );
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("shows slice fills section when order has filled children", () => {
    const order = makeOrder({
      id: "order-1",
      filled: 50,
      children: [
        {
          id: "child-1",
          parentId: "order-1",
          asset: "AAPL",
          side: "BUY",
          quantity: 50,
          limitPrice: 150,
          status: "filled",
          filled: 50,
          submittedAt: now,
        },
      ],
    });
    renderPanel([order], "order-1");
    expect(screen.getByText(/Slice fills/i)).toBeInTheDocument();
  });

  it("does not show slice fills when no children", () => {
    renderPanel([makeOrder({ id: "order-1", children: [] })], "order-1");
    expect(screen.queryByText(/Slice fills/i)).not.toBeInTheDocument();
  });

  it("shows the order ID in the header", () => {
    renderPanel(
      [makeOrder({ id: "abcdef12-0000-0000-0000-000000000000" })],
      "abcdef12-0000-0000-0000-000000000000"
    );
    expect(screen.getByText("abcdef12")).toBeInTheDocument();
  });
});

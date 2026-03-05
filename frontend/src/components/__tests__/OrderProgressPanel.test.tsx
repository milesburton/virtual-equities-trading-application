import { configureStore } from "@reduxjs/toolkit";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it } from "vitest";
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

function makeStore(orders: OrderRecord[] = []) {
  return configureStore({
    reducer: {
      orders: ordersSlice.reducer,
      market: marketSlice.reducer,
      ui: uiSlice.reducer,
      channels: channelsSlice.reducer,
      windows: windowSlice.reducer,
    },
    preloadedState: { orders: { orders } },
  });
}

function renderPanel(orders: OrderRecord[] = []) {
  const store = makeStore(orders);
  return render(
    <Provider store={store}>
      <OrderProgressPanel />
    </Provider>
  );
}

describe("OrderProgressPanel", () => {
  it("shows empty state when no active orders", () => {
    renderPanel();
    expect(screen.getByText(/No active orders/i)).toBeInTheDocument();
  });

  it("shows active order count in header", () => {
    renderPanel([makeOrder(), makeOrder({ id: "order-2", status: "queued", filled: 0 })]);
    expect(screen.getByText(/2 active orders/i)).toBeInTheDocument();
  });

  it("renders a pie chart entry for each executing/queued order", () => {
    renderPanel([
      makeOrder({ id: "order-1", filled: 50 }),
      makeOrder({ id: "order-2", filled: 25, status: "queued" }),
    ]);
    expect(screen.getByText(/50%/)).toBeInTheDocument();
    expect(screen.getByText(/25%/)).toBeInTheDocument();
  });

  it("does not render expired orders in pies", () => {
    renderPanel([makeOrder({ id: "order-1", status: "expired", filled: 0 })]);
    expect(screen.getByText(/No active orders/i)).toBeInTheDocument();
  });

  it("shows 'Avg Fill by Strategy' bar chart section", () => {
    renderPanel([makeOrder()]);
    expect(screen.getByText(/Avg Fill by Strategy/i)).toBeInTheDocument();
  });

  it("shows 'No orders yet' when all orders are expired", () => {
    renderPanel([makeOrder({ status: "expired", filled: 0 })]);
    expect(screen.getByText(/No orders yet/i)).toBeInTheDocument();
  });

  it("includes filled orders in the strategy bar chart section", () => {
    const { container } = renderPanel([
      makeOrder({ id: "order-1", status: "filled", filled: 100 }),
      makeOrder({ id: "order-2", status: "executing", filled: 50 }),
    ]);
    expect(container.querySelector(".recharts-responsive-container")).toBeTruthy();
  });

  it("shows singular 'order' when exactly one active order", () => {
    renderPanel([makeOrder()]);
    expect(screen.getByText(/1 active order/i)).toBeInTheDocument();
  });
});

import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it } from "vitest";
import { ordersSlice } from "../../store/ordersSlice";
import { windowSlice } from "../../store/windowSlice";
import type { OrderRecord } from "../../types";
import { OrderBlotter } from "../OrderBlotter";

const now = Date.now();

function makeOrder(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: "order-uuid-1234",
    submittedAt: now,
    asset: "AAPL",
    side: "BUY",
    quantity: 100,
    limitPrice: 150,
    expiresAt: now + 300_000,
    strategy: "LIMIT",
    status: "queued",
    filled: 0,
    algoParams: { strategy: "LIMIT" },
    children: [],
    ...overrides,
  };
}

function makeStore(orders: OrderRecord[] = []) {
  return configureStore({
    reducer: {
      orders: ordersSlice.reducer,
      windows: windowSlice.reducer,
    },
    preloadedState: {
      orders: { orders },
    },
  });
}

function renderBlotter(orders: OrderRecord[] = []) {
  return render(
    <Provider store={makeStore(orders)}>
      <OrderBlotter />
    </Provider>
  );
}

describe("OrderBlotter – empty state", () => {
  it("shows empty placeholder when there are no orders", () => {
    renderBlotter([]);
    expect(screen.getByText(/No orders submitted yet/i)).toBeInTheDocument();
  });

  it("shows 0 orders in the header", () => {
    renderBlotter([]);
    expect(screen.getByText(/0 orders/i)).toBeInTheDocument();
  });
});

describe("OrderBlotter – single order", () => {
  it("shows order count in header", () => {
    renderBlotter([makeOrder()]);
    expect(screen.getByText(/1 order$/i)).toBeInTheDocument();
  });

  it("renders the asset symbol", () => {
    renderBlotter([makeOrder({ asset: "MSFT" })]);
    expect(screen.getByText("MSFT")).toBeInTheDocument();
  });

  it("renders the strategy", () => {
    renderBlotter([makeOrder({ strategy: "TWAP" })]);
    expect(screen.getByText("TWAP")).toBeInTheDocument();
  });

  it("renders the status badge", () => {
    renderBlotter([makeOrder({ status: "executing" })]);
    expect(screen.getByText("executing")).toBeInTheDocument();
  });

  it("renders the side in colour-coded cell", () => {
    renderBlotter([makeOrder({ side: "SELL" })]);
    expect(screen.getByText("SELL")).toBeInTheDocument();
  });

  it("shows — for avg fill when there are no children", () => {
    renderBlotter([makeOrder()]);
    // The last column cell for avg fill shows —
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });
});

describe("OrderBlotter – multiple orders", () => {
  it("shows plural 'orders' in header count", () => {
    renderBlotter([makeOrder(), makeOrder({ id: "order-2" })]);
    expect(screen.getByText(/2 orders/i)).toBeInTheDocument();
  });
});

describe("OrderBlotter – child order expansion", () => {
  const child = {
    id: "child-1",
    parentId: "order-uuid-1234",
    asset: "AAPL",
    side: "BUY" as const,
    quantity: 25,
    limitPrice: 150,
    status: "filled" as const,
    filled: 25,
    submittedAt: now,
  };

  it("shows expand button when order has children", () => {
    const order = makeOrder({ children: [child] });
    renderBlotter([order]);
    // The expand button is the ▸ character
    expect(screen.getByText("▸")).toBeInTheDocument();
  });

  it("expands child rows when expand button is clicked", () => {
    const order = makeOrder({ children: [child] });
    renderBlotter([order]);

    fireEvent.click(screen.getByText("▸"));

    // child row shows ↳ prefix on id
    expect(screen.getByText(/↳/)).toBeInTheDocument();
  });

  it("collapses child rows when expand button clicked again", () => {
    const order = makeOrder({ children: [child] });
    renderBlotter([order]);

    fireEvent.click(screen.getByText("▸"));
    expect(screen.getByText("▾")).toBeInTheDocument();

    fireEvent.click(screen.getByText("▾"));
    expect(screen.queryByText(/↳/)).not.toBeInTheDocument();
  });

  it("shows avg fill price when children exist", () => {
    const order = makeOrder({
      children: [child],
      filled: 25,
      status: "filled",
    });
    renderBlotter([order]);
    // avg fill = 150.0000
    expect(screen.getByText("150.0000")).toBeInTheDocument();
  });
});

describe("OrderBlotter – status styles", () => {
  const statuses = ["queued", "executing", "filled", "expired"] as const;

  for (const status of statuses) {
    it(`renders ${status} badge`, () => {
      renderBlotter([makeOrder({ status })]);
      expect(screen.getByText(status)).toBeInTheDocument();
    });
  }
});

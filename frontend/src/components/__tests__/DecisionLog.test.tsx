import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it } from "vitest";
import { channelsSlice } from "../../store/channelsSlice";
import { marketSlice } from "../../store/marketSlice";
import { observabilitySlice } from "../../store/observabilitySlice";
import { ordersSlice } from "../../store/ordersSlice";
import { uiSlice } from "../../store/uiSlice";
import { windowSlice } from "../../store/windowSlice";
import type { ObsEvent, Strategy } from "../../types";
import { DecisionLog } from "../DecisionLog";

function makeStore(events: ObsEvent[] = [], selectedAsset?: string) {
  return configureStore({
    reducer: {
      market: marketSlice.reducer,
      orders: ordersSlice.reducer,
      ui: uiSlice.reducer,
      windows: windowSlice.reducer,
      observability: observabilitySlice.reducer,
      channels: channelsSlice.reducer,
    },
    preloadedState: {
      observability: { events },
      ui: {
        activeStrategy: "TWAP" as Strategy,
        activeSide: "BUY" as "BUY" | "SELL",
        showShortcuts: false,
        selectedAsset: selectedAsset ?? null,
        updateAvailable: false,
      },
    },
  });
}

function renderLog(events: ObsEvent[] = [], selectedAsset?: string) {
  const store = makeStore(events, selectedAsset);
  render(
    <Provider store={store}>
      <DecisionLog />
    </Provider>
  );
  return store;
}

const submittedEvent: ObsEvent = {
  type: "orders.submitted",
  ts: 1_700_000_000_000,
  payload: {
    algo: "TWAP",
    asset: "AAPL",
    side: "BUY",
    qty: 500,
    price: 155,
    orderId: "ord-001",
  },
};

const heartbeatEvent: ObsEvent = {
  type: "algo.heartbeat",
  ts: 1_700_000_001_000,
  payload: { algo: "TWAP", asset: "AAPL", activeOrders: 2 },
};

const filledEvent: ObsEvent = {
  type: "orders.filled",
  ts: 1_700_000_002_000,
  payload: {
    algo: "TWAP",
    asset: "AAPL",
    filledQty: 100,
    avgFillPrice: 155.5,
    totalFilled: 100,
    totalQty: 500,
    marketImpactBps: 3.2,
  },
};

describe("DecisionLog – empty state", () => {
  it("shows waiting message when no events", () => {
    renderLog([]);
    expect(screen.getByText(/Waiting for algo activity/i)).toBeInTheDocument();
  });

  it("shows Decision Log label in toolbar", () => {
    renderLog([]);
    expect(screen.getByText("Decision Log")).toBeInTheDocument();
  });

  it("shows event count as 0 when no events", () => {
    renderLog([]);
    expect(screen.getByText("0 events")).toBeInTheDocument();
  });
});

describe("DecisionLog – with events", () => {
  it("renders submitted events", () => {
    renderLog([submittedEvent]);
    expect(screen.getByText("Submitted")).toBeInTheDocument();
  });

  it("renders algo tag for events with algo", () => {
    renderLog([submittedEvent]);
    // TWAP appears as algo tag in the table (may also appear in filter dropdown option)
    const twapEls = screen.getAllByText("TWAP");
    expect(twapEls.length).toBeGreaterThan(0);
  });

  it("shows correct event count", () => {
    renderLog([submittedEvent, filledEvent]);
    expect(screen.getByText("2 events")).toBeInTheDocument();
  });

  it("filters out heartbeats by default", () => {
    renderLog([submittedEvent, heartbeatEvent]);
    expect(screen.queryByText("Heartbeat")).not.toBeInTheDocument();
    expect(screen.getByText("1 events")).toBeInTheDocument();
  });

  it("shows heartbeats when checkbox is enabled", () => {
    renderLog([submittedEvent, heartbeatEvent]);
    fireEvent.click(screen.getByLabelText(/Heartbeats/i));
    expect(screen.getByText("Heartbeat")).toBeInTheDocument();
    expect(screen.getByText("2 events")).toBeInTheDocument();
  });

  it("renders filled events with impact badge", () => {
    renderLog([filledEvent]);
    expect(screen.getByText("+3.2bp")).toBeInTheDocument();
  });
});

describe("DecisionLog – algo filter", () => {
  const povEvent: ObsEvent = {
    type: "orders.submitted",
    ts: 1_700_000_003_000,
    payload: { algo: "POV", asset: "MSFT", side: "SELL", qty: 200, price: 300 },
  };

  it("shows all algos by default", () => {
    renderLog([submittedEvent, povEvent]);
    expect(screen.getByText("2 events")).toBeInTheDocument();
  });

  it("filters to selected algo when filter is changed", () => {
    renderLog([submittedEvent, povEvent]);
    const select = screen.getByLabelText(/Filter by algo/i);
    fireEvent.change(select, { target: { value: "TWAP" } });
    expect(screen.getByText("1 events")).toBeInTheDocument();
  });
});

describe("DecisionLog – channel filter", () => {
  it("shows asset badge when selected asset is set", () => {
    renderLog([submittedEvent], "AAPL");
    expect(screen.getByText("AAPL")).toBeInTheDocument();
  });

  it("shows no match message when events don't match selected asset", () => {
    renderLog([submittedEvent], "MSFT");
    expect(screen.getByText(/No events match current filters/i)).toBeInTheDocument();
  });
});

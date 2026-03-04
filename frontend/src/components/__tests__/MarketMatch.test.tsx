import { configureStore } from "@reduxjs/toolkit";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it } from "vitest";
import { channelsSlice } from "../../store/channelsSlice";
import { marketSlice } from "../../store/marketSlice";
import { observabilitySlice } from "../../store/observabilitySlice";
import { ordersSlice } from "../../store/ordersSlice";
import { uiSlice } from "../../store/uiSlice";
import { windowSlice } from "../../store/windowSlice";
import type { ObsEvent, Strategy } from "../../types";
import { MarketMatch } from "../MarketMatch";

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
      market: {
        assets: [],
        prices: {},
        priceHistory: {},
        candleHistory: {},
        orderBook: {},
        connected: true,
      },
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

function renderMatch(events: ObsEvent[] = [], selectedAsset?: string) {
  const store = makeStore(events, selectedAsset);
  render(
    <Provider store={store}>
      <MarketMatch />
    </Provider>
  );
  return store;
}

function makeFillEvent(overrides: Record<string, unknown> = {}): ObsEvent {
  return {
    type: "orders.filled",
    ts: 1_700_000_000_000,
    payload: {
      ts: 1_700_000_000_000,
      asset: "AAPL",
      side: "BUY",
      filledQty: 100,
      avgFillPrice: 155.5,
      marketImpactBps: 2.0,
      venue: "XNAS",
      liquidityFlag: "MAKER",
      commissionUSD: 0.5,
      parentOrderId: "ord-001",
      ...overrides,
    },
  };
}

describe("MarketMatch – empty state", () => {
  it("shows no fills message when no events", () => {
    renderMatch([]);
    expect(screen.getByText(/No fills recorded yet/i)).toBeInTheDocument();
  });

  it("renders Market Match label in toolbar", () => {
    renderMatch([]);
    expect(screen.getByText("Market Match")).toBeInTheDocument();
  });

  it("shows fill count as 0", () => {
    renderMatch([]);
    expect(screen.getByText("0 fills")).toBeInTheDocument();
  });
});

describe("MarketMatch – with fills", () => {
  it("renders a fill row with asset symbol", () => {
    renderMatch([makeFillEvent()]);
    expect(screen.getAllByText("AAPL").length).toBeGreaterThan(0);
  });

  it("renders BUY side with correct text", () => {
    renderMatch([makeFillEvent({ side: "BUY" })]);
    expect(screen.getByText("BUY")).toBeInTheDocument();
  });

  it("renders SELL side with correct text", () => {
    renderMatch([makeFillEvent({ side: "SELL" })]);
    expect(screen.getByText("SELL")).toBeInTheDocument();
  });

  it("renders fill price", () => {
    renderMatch([makeFillEvent({ avgFillPrice: 155.5 })]);
    expect(screen.getByText("155.50")).toBeInTheDocument();
  });

  it("renders fill quantity", () => {
    renderMatch([makeFillEvent({ filledQty: 100 })]);
    // "100" appears in qty cell and possibly stats — use getAllByText
    expect(screen.getAllByText("100").length).toBeGreaterThan(0);
  });

  it("renders correct fill count", () => {
    renderMatch([makeFillEvent(), makeFillEvent({ asset: "MSFT" })]);
    expect(screen.getByText("2 fills")).toBeInTheDocument();
  });

  it("renders MAKER liquidity flag badge", () => {
    renderMatch([makeFillEvent({ liquidityFlag: "MAKER" })]);
    expect(screen.getByText("MAKER")).toBeInTheDocument();
  });

  it("renders TAKER liquidity flag badge", () => {
    renderMatch([makeFillEvent({ liquidityFlag: "TAKER" })]);
    expect(screen.getByText("TAKER")).toBeInTheDocument();
  });

  it("renders venue code", () => {
    renderMatch([makeFillEvent({ venue: "XNAS" })]);
    // XNAS appears in fill row and stats bar top venues
    expect(screen.getAllByText(/XNAS/).length).toBeGreaterThan(0);
  });

  it("renders positive impact in basis points", () => {
    renderMatch([makeFillEvent({ marketImpactBps: 3.5 })]);
    // Impact appears in fill row and avg impact in stats bar
    expect(screen.getAllByText("+3.5bp").length).toBeGreaterThan(0);
  });

  it("renders negative impact correctly", () => {
    renderMatch([makeFillEvent({ marketImpactBps: -4.2 })]);
    expect(screen.getAllByText("-4.2bp").length).toBeGreaterThan(0);
  });

  it("renders commission amount", () => {
    renderMatch([makeFillEvent({ commissionUSD: 1.25 })]);
    // Commission appears in fill row and total commission in stats bar
    expect(screen.getAllByText("$1.25").length).toBeGreaterThan(0);
  });
});

describe("MarketMatch – stats bar", () => {
  it("renders summary stats section with fills present", () => {
    renderMatch([makeFillEvent()]);
    expect(screen.getByText(/Buy \/ Sell flow/i)).toBeInTheDocument();
    expect(screen.getByText(/Maker \/ Taker/i)).toBeInTheDocument();
    expect(screen.getByText(/Avg Impact/i)).toBeInTheDocument();
    expect(screen.getByText(/Commission/i)).toBeInTheDocument();
  });
});

describe("MarketMatch – channel filter", () => {
  it("filters fills to selected asset only", () => {
    renderMatch([makeFillEvent({ asset: "AAPL" }), makeFillEvent({ asset: "MSFT" })], "AAPL");
    expect(screen.getByText("1 fills")).toBeInTheDocument();
  });

  it("shows no fills message for asset with no matching fills", () => {
    renderMatch([makeFillEvent({ asset: "AAPL" })], "MSFT");
    expect(screen.getByText(/No fills for MSFT/i)).toBeInTheDocument();
  });
});

describe("MarketMatch – table headers", () => {
  it("renders column headers when fills are present", () => {
    renderMatch([makeFillEvent()]);
    expect(screen.getByText("Time")).toBeInTheDocument();
    expect(screen.getByText("Side")).toBeInTheDocument();
    expect(screen.getByText("Asset")).toBeInTheDocument();
    expect(screen.getByText("Qty")).toBeInTheDocument();
    expect(screen.getByText("Fill Px")).toBeInTheDocument();
  });
});

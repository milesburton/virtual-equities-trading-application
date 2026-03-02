import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it } from "vitest";
import { marketSlice } from "../../store/marketSlice";
import { uiSlice } from "../../store/uiSlice";
import { windowSlice } from "../../store/windowSlice";
import type { AssetDef, MarketPrices, PriceHistory } from "../../types";
import { MarketLadder } from "../MarketLadder";

const assets: AssetDef[] = [
  { symbol: "AAPL", initialPrice: 150, volatility: 0.02, sector: "Technology" },
  { symbol: "MSFT", initialPrice: 300, volatility: 0.015, sector: "Technology" },
  { symbol: "XOM", initialPrice: 80, volatility: 0.025, sector: "Energy" },
  { symbol: "JPM", initialPrice: 150, volatility: 0.02, sector: "Finance" },
];

const prices: MarketPrices = { AAPL: 155, MSFT: 305, XOM: 82, JPM: 148 };

const priceHistory: PriceHistory = {
  AAPL: [150, 152, 155],
  MSFT: [298, 302, 305],
  XOM: [79, 80, 82],
  JPM: [149, 147, 148],
};

function makeStore(
  overrides: { assets?: AssetDef[]; prices?: MarketPrices; priceHistory?: PriceHistory } = {}
) {
  return configureStore({
    reducer: {
      market: marketSlice.reducer,
      ui: uiSlice.reducer,
      windows: windowSlice.reducer,
    },
    preloadedState: {
      market: {
        assets: overrides.assets ?? assets,
        prices: overrides.prices ?? prices,
        priceHistory: overrides.priceHistory ?? priceHistory,
        candleHistory: {},
        connected: true,
        orderBook: {},
      },
    },
  });
}

function renderLadder(
  overrides: { assets?: AssetDef[]; prices?: MarketPrices; priceHistory?: PriceHistory } = {}
) {
  return render(
    <Provider store={makeStore(overrides)}>
      <MarketLadder />
    </Provider>
  );
}

describe("MarketLadder – header", () => {
  it("shows filtered / total count", () => {
    renderLadder();
    expect(screen.getByText(`${assets.length}/${assets.length}`)).toBeInTheDocument();
  });
});

describe("MarketLadder – search filter", () => {
  it("renders a search input", () => {
    renderLadder();
    expect(screen.getByPlaceholderText(/Search symbol or sector/i)).toBeInTheDocument();
  });

  it("filters rows by symbol when typing", () => {
    renderLadder();
    const input = screen.getByPlaceholderText(/Search symbol or sector/i);
    fireEvent.change(input, { target: { value: "AAPL" } });
    expect(screen.getByText("1/4")).toBeInTheDocument();
  });

  it("filters rows by sector when typing", () => {
    renderLadder();
    const input = screen.getByPlaceholderText(/Search symbol or sector/i);
    fireEvent.change(input, { target: { value: "Technology" } });
    expect(screen.getByText("2/4")).toBeInTheDocument();
  });

  it("is case-insensitive", () => {
    renderLadder();
    const input = screen.getByPlaceholderText(/Search symbol or sector/i);
    fireEvent.change(input, { target: { value: "aapl" } });
    expect(screen.getByText("1/4")).toBeInTheDocument();
  });
});

describe("MarketLadder – sector filter", () => {
  it("renders sector dropdown with All option", () => {
    renderLadder();
    const select = screen.getByRole("combobox");
    expect(select).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "All" })).toBeInTheDocument();
  });

  it("populates sector options from assets", () => {
    renderLadder();
    expect(screen.getByRole("option", { name: "Technology" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Energy" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Finance" })).toBeInTheDocument();
  });

  it("filters to a specific sector", () => {
    renderLadder();
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "Energy" } });
    expect(screen.getByText("1/4")).toBeInTheDocument();
  });
});

describe("MarketLadder – column headers", () => {
  it("renders all column headers", () => {
    renderLadder();
    expect(screen.getByText("Symbol")).toBeInTheDocument();
    expect(screen.getByText("Bid")).toBeInTheDocument();
    expect(screen.getByText("Ask")).toBeInTheDocument();
    expect(screen.getByText("Last")).toBeInTheDocument();
    expect(screen.getByText("Δ%")).toBeInTheDocument();
    expect(screen.getByText("Chart")).toBeInTheDocument();
  });
});

describe("MarketLadder – row rendering (via react-window)", () => {
  it("renders at least one asset symbol", () => {
    renderLadder();
    // react-window virtualization may render a subset; just check at least one
    const aapl = screen.queryAllByText("AAPL");
    const msft = screen.queryAllByText("MSFT");
    expect(aapl.length + msft.length).toBeGreaterThan(0);
  });
});

describe("MarketLadder – empty assets", () => {
  it("renders with empty assets list without crashing", () => {
    renderLadder({ assets: [], prices: {}, priceHistory: {} });
    expect(screen.getByText("0/0")).toBeInTheDocument();
  });
});

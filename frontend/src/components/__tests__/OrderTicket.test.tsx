import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";
import { TradingProvider } from "../../context/TradingContext";
import { ChannelContext } from "../../contexts/ChannelContext";
import { channelsSlice } from "../../store/channelsSlice";
import { marketSlice } from "../../store/marketSlice";
import { ordersSlice } from "../../store/ordersSlice";
import { uiSlice } from "../../store/uiSlice";
import { windowSlice } from "../../store/windowSlice";
import type { AssetDef, MarketPrices } from "../../types";
import { OrderTicket } from "../OrderTicket";

const assets: AssetDef[] = [
  { symbol: "AAPL", initialPrice: 150, volatility: 0.02, sector: "Technology" },
  { symbol: "MSFT", initialPrice: 300, volatility: 0.015, sector: "Technology" },
];

const prices: MarketPrices = { AAPL: 155, MSFT: 305 };

function makeStore() {
  return configureStore({
    reducer: {
      market: marketSlice.reducer,
      orders: ordersSlice.reducer,
      ui: uiSlice.reducer,
      windows: windowSlice.reducer,
      channels: channelsSlice.reducer,
    },
    preloadedState: {
      market: {
        assets,
        prices,
        priceHistory: {},
        candleHistory: {},
        candlesReady: {},
        connected: true,
        orderBook: {},
      },
    },
  });
}

function renderTicket() {
  const testStore = makeStore();
  render(
    <Provider store={testStore}>
      <ChannelContext.Provider
        value={{
          instanceId: "order-ticket",
          panelType: "order-ticket",
          outgoing: null,
          incoming: null,
        }}
      >
        <TradingProvider>
          <OrderTicket />
        </TradingProvider>
      </ChannelContext.Provider>
    </Provider>
  );
  return testStore;
}

describe("OrderTicket – rendering", () => {
  it("renders strategy selector with all options", () => {
    renderTicket();
    expect(screen.getByLabelText(/Strategy/i)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Limit Order" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /TWAP/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /POV/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /VWAP/i })).toBeInTheDocument();
  });

  it("renders quantity input", () => {
    renderTicket();
    expect(screen.getByLabelText(/Quantity/i)).toBeInTheDocument();
  });

  it("renders limit price input", () => {
    renderTicket();
    expect(screen.getByLabelText(/Limit Price/i)).toBeInTheDocument();
  });

  it("renders expiry input", () => {
    renderTicket();
    expect(screen.getByLabelText(/Duration/i)).toBeInTheDocument();
  });

  it("renders BUY and SELL side buttons", () => {
    renderTicket();
    expect(screen.getByRole("button", { name: "BUY" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "SELL" })).toBeInTheDocument();
  });

  it("pre-fills limit price from market price on first render", () => {
    renderTicket();
    const priceInput = screen.getByLabelText(/Limit Price/i) as HTMLInputElement;
    // AAPL is selected by default; price = 155 → "155.00"
    expect(priceInput.value).toBe("155.00");
  });

  it("renders 'snap to mid' button when a price is available", () => {
    renderTicket();
    expect(screen.getByTitle(/Snap limit price to current mid/i)).toBeInTheDocument();
  });
});

describe("OrderTicket – side toggle", () => {
  it("activates SELL side when SELL button clicked", () => {
    renderTicket();
    fireEvent.click(screen.getByRole("button", { name: "SELL" }));
    // submit button aria-label changes to reflect SELL side
    const submitBtn = screen.getByRole("button", { name: /Submit SELL order/i });
    expect(submitBtn).toBeInTheDocument();
  });

  it("activates BUY side when BUY button clicked", () => {
    renderTicket();
    fireEvent.click(screen.getByRole("button", { name: "SELL" }));
    fireEvent.click(screen.getByRole("button", { name: "BUY" }));
    const submitBtn = screen.getByRole("button", { name: /Submit BUY order/i });
    expect(submitBtn).toBeInTheDocument();
  });
});

describe("OrderTicket – strategy params visibility", () => {
  it("shows TWAP params when TWAP strategy is selected", () => {
    renderTicket();
    const select = screen.getByLabelText(/Strategy/i);
    fireEvent.change(select, { target: { value: "TWAP" } });
    expect(screen.getByText(/TWAP Params/i)).toBeInTheDocument();
  });

  it("shows POV params when POV strategy is selected", () => {
    renderTicket();
    const select = screen.getByLabelText(/Strategy/i);
    fireEvent.change(select, { target: { value: "POV" } });
    expect(screen.getByText(/POV Params/i)).toBeInTheDocument();
  });

  it("shows VWAP params when VWAP strategy is selected", () => {
    renderTicket();
    const select = screen.getByLabelText(/Strategy/i);
    fireEvent.change(select, { target: { value: "VWAP" } });
    expect(screen.getByText(/VWAP Params/i)).toBeInTheDocument();
  });

  it("shows no strategy params for LIMIT", () => {
    renderTicket();
    const select = screen.getByLabelText(/Strategy/i);
    fireEvent.change(select, { target: { value: "LIMIT" } });
    expect(screen.queryByText(/TWAP Params/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/POV Params/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/VWAP Params/i)).not.toBeInTheDocument();
  });
});

describe("OrderTicket – form submission", () => {
  it("shows success feedback after successful submission", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    renderTicket();
    fireEvent.click(screen.getByRole("button", { name: /Submit BUY order/i }));

    await waitFor(() => {
      expect(screen.getByText(/Order submitted/i)).toBeInTheDocument();
    });
    vi.unstubAllGlobals();
  });

  it("adds order to store even when backend fetch fails (fire-and-forget)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
    const testStore = renderTicket();
    fireEvent.click(screen.getByRole("button", { name: /Submit BUY order/i }));

    // The thunk always succeeds (fetch is fire-and-forget), so the order is still added
    await waitFor(() => {
      expect(testStore.getState().orders.orders.length).toBeGreaterThan(0);
    });
    vi.unstubAllGlobals();
  });

  it("adds order to store after submission", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const testStore = renderTicket();
    fireEvent.click(screen.getByRole("button", { name: /Submit BUY order/i }));

    await waitFor(() => {
      expect(testStore.getState().orders.orders.length).toBeGreaterThan(0);
    });
    vi.unstubAllGlobals();
  });
});

describe("OrderTicket – form validation", () => {
  it("submit button is disabled when quantity is empty", () => {
    renderTicket();
    const qtyInput = screen.getByLabelText(/Quantity/i);
    fireEvent.change(qtyInput, { target: { value: "" } });
    // When invalid, aria-label becomes "Submit order (form incomplete)"
    const submit = screen.getByRole("button", { name: /Submit order/i });
    expect(submit).toBeDisabled();
  });

  it("submit button is disabled when limit price is zero", () => {
    renderTicket();
    const priceInput = screen.getByLabelText(/Limit Price/i);
    fireEvent.change(priceInput, { target: { value: "0" } });
    const submit = screen.getByRole("button", { name: /Submit order/i });
    expect(submit).toBeDisabled();
  });
});

describe("OrderTicket – Mid button", () => {
  it("sets limit price to current market price when clicked", () => {
    renderTicket();
    const priceInput = screen.getByLabelText(/Limit Price/i) as HTMLInputElement;
    // Change price to something else first
    fireEvent.change(priceInput, { target: { value: "100.00" } });

    fireEvent.click(screen.getByTitle(/Snap limit price to current mid/i));
    expect(priceInput.value).toBe("155.00");
  });
});

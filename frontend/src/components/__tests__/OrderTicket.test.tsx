import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TradingProvider } from "../../context/TradingContext";
import type { AssetDef, MarketPrices } from "../../types";
import { OrderTicket } from "../OrderTicket";

const assets: AssetDef[] = [
  { symbol: "AAPL", initialPrice: 150, volatility: 0.02, sector: "Technology" },
  { symbol: "MSFT", initialPrice: 300, volatility: 0.015, sector: "Technology" },
];

const prices: MarketPrices = { AAPL: 155, MSFT: 305 };

function renderTicket(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  return render(
    <TradingProvider>
      <OrderTicket assets={assets} prices={prices} onSubmit={onSubmit} />
    </TradingProvider>
  );
}

describe("OrderTicket – rendering", () => {
  it("renders the Order Ticket header", () => {
    renderTicket();
    expect(screen.getByText(/Order Ticket/i)).toBeInTheDocument();
  });

  it("renders strategy selector with all options", () => {
    renderTicket();
    expect(screen.getByLabelText(/Strategy/i)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Limit Order" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "TWAP" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "POV" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "VWAP" })).toBeInTheDocument();
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
    expect(screen.getByLabelText(/Expiry/i)).toBeInTheDocument();
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

  it("renders 'Use market' button when a price is available", () => {
    renderTicket();
    expect(screen.getByRole("button", { name: /Use market/i })).toBeInTheDocument();
  });
});

describe("OrderTicket – side toggle", () => {
  it("activates SELL side when SELL button clicked", () => {
    renderTicket();
    fireEvent.click(screen.getByRole("button", { name: "SELL" }));
    // submit button label changes to include SELL
    const submitBtn = screen.getByRole("button", { name: /SELL AAPL/i });
    expect(submitBtn).toBeInTheDocument();
  });

  it("activates BUY side when BUY button clicked", () => {
    renderTicket();
    fireEvent.click(screen.getByRole("button", { name: "SELL" }));
    fireEvent.click(screen.getByRole("button", { name: "BUY" }));
    const submitBtn = screen.getByRole("button", { name: /BUY AAPL/i });
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
    expect(screen.queryByText(/TWAP Params/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/POV Params/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/VWAP Params/i)).not.toBeInTheDocument();
  });
});

describe("OrderTicket – form submission", () => {
  it("calls onSubmit with the correct trade when form is submitted", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderTicket(onSubmit);

    // quantity is already "100" by default; limitPrice filled from prices
    fireEvent.click(screen.getByRole("button", { name: /BUY AAPL/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          asset: "AAPL",
          side: "BUY",
          quantity: 100,
          limitPrice: 155,
          algoParams: { strategy: "LIMIT" },
        })
      );
    });
  });

  it("shows success feedback after successful submission", async () => {
    renderTicket();
    fireEvent.click(screen.getByRole("button", { name: /BUY AAPL/i }));

    await waitFor(() => {
      expect(screen.getByText(/Order submitted/i)).toBeInTheDocument();
    });
  });

  it("shows error feedback when onSubmit rejects", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("Network error"));
    renderTicket(onSubmit);

    fireEvent.click(screen.getByRole("button", { name: /BUY AAPL/i }));

    await waitFor(() => {
      expect(screen.getByText(/Failed to submit order/i)).toBeInTheDocument();
    });
  });

  it("disables submit button while submitting", async () => {
    // Simulate a slow submit
    let resolve: (() => void) | undefined;
    const onSubmit = vi.fn().mockReturnValue(
      new Promise<void>((r) => {
        resolve = r;
      })
    );
    renderTicket(onSubmit);

    fireEvent.click(screen.getByRole("button", { name: /BUY AAPL/i }));

    // While pending, button shows "Submitting…"
    expect(screen.getByRole("button", { name: /Submitting/i })).toBeDisabled();

    // Resolve and clean up
    resolve?.();
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Submitting/i })).not.toBeInTheDocument();
    });
  });
});

describe("OrderTicket – form validation", () => {
  it("submit button is disabled when quantity is empty", () => {
    renderTicket();
    const qtyInput = screen.getByLabelText(/Quantity/i);
    fireEvent.change(qtyInput, { target: { value: "" } });
    // The submit button should be disabled
    const submit = screen.getByRole("button", { name: /BUY AAPL/i });
    expect(submit).toBeDisabled();
  });

  it("submit button is disabled when limit price is zero", () => {
    renderTicket();
    const priceInput = screen.getByLabelText(/Limit Price/i);
    fireEvent.change(priceInput, { target: { value: "0" } });
    const submit = screen.getByRole("button", { name: /BUY AAPL/i });
    expect(submit).toBeDisabled();
  });
});

describe("OrderTicket – Use market button", () => {
  it("sets limit price to current market price when clicked", () => {
    renderTicket();
    const priceInput = screen.getByLabelText(/Limit Price/i) as HTMLInputElement;
    // Change price to something else first
    fireEvent.change(priceInput, { target: { value: "100.00" } });

    fireEvent.click(screen.getByRole("button", { name: /Use market/i }));
    expect(priceInput.value).toBe("155.00");
  });
});

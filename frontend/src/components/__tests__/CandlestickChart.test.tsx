import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { OhlcCandle } from "../../types";
import { CandlestickChart } from "../CandlestickChart";

// lightweight-charts renders to canvas which jsdom doesn't support — stub it out
vi.mock("lightweight-charts", () => {
  const seriesStub = { setData: vi.fn(), applyOptions: vi.fn() };
  const priceScaleStub = { applyOptions: vi.fn() };
  const chartStub = {
    addSeries: vi.fn(() => seriesStub),
    priceScale: vi.fn(() => priceScaleStub),
    applyOptions: vi.fn(),
    timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
    remove: vi.fn(),
  };
  return {
    createChart: vi.fn(() => chartStub),
    CandlestickSeries: {},
    HistogramSeries: {},
    ColorType: { Solid: "solid" },
    CrosshairMode: { Normal: 0 },
  };
});

function makeCandle(overrides: Partial<OhlcCandle> = {}): OhlcCandle {
  return {
    time: Date.now(),
    open: 150,
    high: 155,
    low: 148,
    close: 152,
    ...overrides,
  };
}

const twoCandles = [makeCandle({ time: 1000 }), makeCandle({ time: 2000, close: 153 })];
const emptyCandles = { "1m": [], "5m": [] };
const filledCandles = { "1m": twoCandles, "5m": twoCandles };

describe("CandlestickChart – rendering", () => {
  it("renders the symbol in the header", () => {
    render(<CandlestickChart symbol="AAPL" candles={filledCandles} onClose={vi.fn()} />);
    expect(screen.getByText("AAPL")).toBeInTheDocument();
  });

  it("renders interval buttons 1m and 5m", () => {
    render(<CandlestickChart symbol="MSFT" candles={filledCandles} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "1m" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "5m" })).toBeInTheDocument();
  });

  it("renders close button", () => {
    render(<CandlestickChart symbol="AAPL" candles={filledCandles} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Close chart/i })).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(<CandlestickChart symbol="AAPL" candles={filledCandles} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /Close chart/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("CandlestickChart – empty state", () => {
  it("shows collecting message when fewer than 2 candles", () => {
    render(<CandlestickChart symbol="AAPL" candles={emptyCandles} onClose={vi.fn()} />);
    expect(screen.getByText(/Collecting 1m candles/i)).toBeInTheDocument();
  });

  it("shows collecting 5m when interval is 5m and no candles", () => {
    render(<CandlestickChart symbol="AAPL" candles={emptyCandles} onClose={vi.fn()} />);
    // Switch to 5m
    fireEvent.click(screen.getByRole("button", { name: "5m" }));
    expect(screen.getByText(/Collecting 5m candles/i)).toBeInTheDocument();
  });
});

describe("CandlestickChart – interval switching", () => {
  it("defaults to 1m interval", () => {
    render(<CandlestickChart symbol="AAPL" candles={filledCandles} onClose={vi.fn()} />);
    // 1m button should be highlighted (it contains the active class)
    const btn1m = screen.getByRole("button", { name: "1m" });
    expect(btn1m.className).toContain("bg-emerald-700");
  });

  it("switches to 5m interval when 5m button is clicked", () => {
    render(<CandlestickChart symbol="AAPL" candles={filledCandles} onClose={vi.fn()} />);
    const btn5m = screen.getByRole("button", { name: "5m" });
    fireEvent.click(btn5m);
    expect(btn5m.className).toContain("bg-emerald-700");
  });

  it("shows collecting message after switching if 5m has no candles", () => {
    const partialCandles = { "1m": twoCandles, "5m": [] };
    render(<CandlestickChart symbol="AAPL" candles={partialCandles} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "5m" }));
    expect(screen.getByText(/Collecting 5m candles/i)).toBeInTheDocument();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { StrategyParams } from "../StrategyParams";

const defaultProps = {
  activeStrategy: "LIMIT",
  twapSlices: "10",
  setTwapSlices: vi.fn(),
  twapCap: "25",
  setTwapCap: vi.fn(),
  povRate: "10",
  setPovRate: vi.fn(),
  povMin: "10",
  setPovMin: vi.fn(),
  povMax: "500",
  setPovMax: vi.fn(),
  vwapDev: "0.5",
  setVwapDev: vi.fn(),
  vwapStart: "0",
  setVwapStart: vi.fn(),
  vwapEnd: "300",
  setVwapEnd: vi.fn(),
};

test("renders nothing when strategy is LIMIT", () => {
  const { container } = render(<StrategyParams {...defaultProps} activeStrategy="LIMIT" />);
  expect(container.firstChild).toBeNull();
});

test("renders twap params when TWAP active", () => {
  render(<StrategyParams {...defaultProps} activeStrategy="TWAP" />);
  expect(screen.getByLabelText(/Slices/)).toBeInTheDocument();
  expect(screen.getByLabelText(/Part. Cap %/)).toBeInTheDocument();
  expect(screen.getByText(/TWAP Params/i)).toBeInTheDocument();
});

test("calls setTwapSlices when TWAP slices input changes", () => {
  const setTwapSlices = vi.fn();
  render(<StrategyParams {...defaultProps} activeStrategy="TWAP" setTwapSlices={setTwapSlices} />);
  fireEvent.change(screen.getByLabelText(/Slices/), { target: { value: "5" } });
  expect(setTwapSlices).toHaveBeenCalledWith("5");
});

test("calls setTwapCap when TWAP cap input changes", () => {
  const setTwapCap = vi.fn();
  render(<StrategyParams {...defaultProps} activeStrategy="TWAP" setTwapCap={setTwapCap} />);
  fireEvent.change(screen.getByLabelText(/Part. Cap %/), { target: { value: "50" } });
  expect(setTwapCap).toHaveBeenCalledWith("50");
});

test("renders POV params when POV active", () => {
  render(<StrategyParams {...defaultProps} activeStrategy="POV" />);
  expect(screen.getByLabelText(/Participation Rate %/)).toBeInTheDocument();
  expect(screen.getByLabelText(/Min Slice/)).toBeInTheDocument();
  expect(screen.getByLabelText(/Max Slice/)).toBeInTheDocument();
  expect(screen.getByText(/POV Params/i)).toBeInTheDocument();
});

test("calls setPovRate when POV rate input changes", () => {
  const setPovRate = vi.fn();
  render(<StrategyParams {...defaultProps} activeStrategy="POV" setPovRate={setPovRate} />);
  fireEvent.change(screen.getByLabelText(/Participation Rate %/), { target: { value: "20" } });
  expect(setPovRate).toHaveBeenCalledWith("20");
});

test("calls setPovMin and setPovMax when POV slice inputs change", () => {
  const setPovMin = vi.fn();
  const setPovMax = vi.fn();
  render(
    <StrategyParams {...defaultProps} activeStrategy="POV" setPovMin={setPovMin} setPovMax={setPovMax} />
  );
  fireEvent.change(screen.getByLabelText(/Min Slice/), { target: { value: "5" } });
  fireEvent.change(screen.getByLabelText(/Max Slice/), { target: { value: "1000" } });
  expect(setPovMin).toHaveBeenCalledWith("5");
  expect(setPovMax).toHaveBeenCalledWith("1000");
});

test("renders VWAP params when VWAP active", () => {
  render(<StrategyParams {...defaultProps} activeStrategy="VWAP" />);
  expect(screen.getByLabelText(/Max Deviation %/)).toBeInTheDocument();
  expect(screen.getByLabelText(/Start Offset/)).toBeInTheDocument();
  expect(screen.getByLabelText(/End Offset/)).toBeInTheDocument();
  expect(screen.getByText(/VWAP Params/i)).toBeInTheDocument();
});

test("calls setVwapDev when VWAP deviation input changes", () => {
  const setVwapDev = vi.fn();
  render(<StrategyParams {...defaultProps} activeStrategy="VWAP" setVwapDev={setVwapDev} />);
  fireEvent.change(screen.getByLabelText(/Max Deviation %/), { target: { value: "1.0" } });
  expect(setVwapDev).toHaveBeenCalledWith("1.0");
});

test("calls setVwapStart and setVwapEnd when VWAP offset inputs change", () => {
  const setVwapStart = vi.fn();
  const setVwapEnd = vi.fn();
  render(
    <StrategyParams
      {...defaultProps}
      activeStrategy="VWAP"
      setVwapStart={setVwapStart}
      setVwapEnd={setVwapEnd}
    />
  );
  fireEvent.change(screen.getByLabelText(/Start Offset/), { target: { value: "10" } });
  fireEvent.change(screen.getByLabelText(/End Offset/), { target: { value: "600" } });
  expect(setVwapStart).toHaveBeenCalledWith("10");
  expect(setVwapEnd).toHaveBeenCalledWith("600");
});

test("does not render TWAP or POV content when VWAP is active", () => {
  render(<StrategyParams {...defaultProps} activeStrategy="VWAP" />);
  expect(screen.queryByText(/TWAP Params/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/POV Params/i)).not.toBeInTheDocument();
});

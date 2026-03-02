import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import type { AssetDef } from "../../types";
import { AssetSelector } from "../AssetSelector";

const assets: AssetDef[] = [
  { symbol: "AAPL", initialPrice: 150, volatility: 0.02, sector: "Tech" },
  { symbol: "GOOGL", initialPrice: 2800, volatility: 0.03, sector: "Tech" },
  { symbol: "MSFT", initialPrice: 300, volatility: 0.015, sector: "Tech" },
];
const prices = { AAPL: 155.5, GOOGL: 2820, MSFT: 305 };

test("renders input and shows filtered results", () => {
  const onChange = vi.fn();
  const onSelect = vi.fn();
  render(
    <AssetSelector
      assets={assets}
      value="A"
      onChange={onChange}
      onSelect={onSelect}
      prices={prices}
    />
  );
  const input = screen.getByRole("textbox");
  expect(input).toBeInTheDocument();

  fireEvent.change(input, { target: { value: "GO" } });
  expect(onChange).toHaveBeenCalledWith("GO");
});

test("shows dropdown list when value matches assets", () => {
  render(
    <AssetSelector
      assets={assets}
      value="A"
      onChange={vi.fn()}
      onSelect={vi.fn()}
      prices={prices}
    />
  );
  // "A" matches AAPL
  expect(screen.getByText("AAPL")).toBeInTheDocument();
});

test("does not show dropdown when value is empty", () => {
  render(
    <AssetSelector
      assets={assets}
      value=""
      onChange={vi.fn()}
      onSelect={vi.fn()}
      prices={prices}
    />
  );
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
});

test("calls onSelect when a dropdown item is clicked", () => {
  const onSelect = vi.fn();
  render(
    <AssetSelector
      assets={assets}
      value="A"
      onChange={vi.fn()}
      onSelect={onSelect}
      prices={prices}
    />
  );
  // AAPL matches "A"
  fireEvent.mouseDown(screen.getByText("AAPL"));
  expect(onSelect).toHaveBeenCalledWith("AAPL");
});

test("filtering is case-insensitive", () => {
  render(
    <AssetSelector
      assets={assets}
      value="aapl"
      onChange={vi.fn()}
      onSelect={vi.fn()}
      prices={prices}
    />
  );
  expect(screen.getByText("AAPL")).toBeInTheDocument();
});

test("shows all matching assets in the dropdown", () => {
  render(
    <AssetSelector
      assets={assets}
      value="A"
      onChange={vi.fn()}
      onSelect={vi.fn()}
      prices={prices}
    />
  );
  // "A" matches AAPL and MSFT (has 'a' case-insensitive)
  // Actually: 'aapl'.includes('a') = true, 'googl'.includes('a') = false,
  // 'msft'.includes('a') = false
  // So only AAPL
  expect(screen.getByText("AAPL")).toBeInTheDocument();
  expect(screen.queryByText("GOOGL")).not.toBeInTheDocument();
});

test("shows current price for the selected asset", () => {
  render(
    <AssetSelector
      assets={assets}
      value="AAPL"
      onChange={vi.fn()}
      onSelect={vi.fn()}
      prices={prices}
    />
  );
  // AAPL at 155.5 → displayed as 155.50
  expect(screen.getByText("155.50")).toBeInTheDocument();
});

test("shows — when no price is available for selected asset", () => {
  render(
    <AssetSelector
      assets={assets}
      value="AAPL"
      onChange={vi.fn()}
      onSelect={vi.fn()}
      prices={{}}
    />
  );
  expect(screen.getByText("—")).toBeInTheDocument();
});

test("shows sector label in dropdown items", () => {
  render(
    <AssetSelector
      assets={assets}
      value="AAPL"
      onChange={vi.fn()}
      onSelect={vi.fn()}
      prices={prices}
    />
  );
  expect(screen.getByText("Tech")).toBeInTheDocument();
});

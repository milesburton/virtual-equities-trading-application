import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import type { AssetDef } from "../../types";
import { AssetSelector } from "../AssetSelector";

const assets: AssetDef[] = [
  { symbol: "AAPL", initialPrice: 150, volatility: 0.02, sector: "Tech" },
  { symbol: "GOOGL", initialPrice: 2800, volatility: 0.03, sector: "Tech" },
];
const prices = { AAPL: 150, GOOGL: 2800 };

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

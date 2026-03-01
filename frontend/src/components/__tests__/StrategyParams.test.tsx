import { render, screen } from "@testing-library/react";
import { StrategyParams } from "../StrategyParams";

test("renders twap params when TWAP active", () => {
  render(
    <StrategyParams
      activeStrategy="TWAP"
      twapSlices="10"
      setTwapSlices={() => {}}
      twapCap="25"
      setTwapCap={() => {}}
      povRate="10"
      setPovRate={() => {}}
      povMin="10"
      setPovMin={() => {}}
      povMax="500"
      setPovMax={() => {}}
      vwapDev="0.5"
      setVwapDev={() => {}}
      vwapStart="0"
      setVwapStart={() => {}}
      vwapEnd="300"
      setVwapEnd={() => {}}
    />
  );
  expect(screen.getByLabelText(/Slices/)).toBeInTheDocument();
});

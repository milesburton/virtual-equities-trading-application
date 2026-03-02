import { describe, expect, it } from "vitest";
import {
  hideShortcuts,
  setActiveSide,
  setActiveStrategy,
  setSelectedAsset,
  toggleShortcuts,
  uiSlice,
} from "../uiSlice";

const { reducer } = uiSlice;
const initial = reducer(undefined, { type: "@@init" });

describe("uiSlice – initial state", () => {
  it("has TWAP as default strategy", () => {
    expect(initial.activeStrategy).toBe("TWAP");
  });

  it("has BUY as default side", () => {
    expect(initial.activeSide).toBe("BUY");
  });

  it("has showShortcuts false by default", () => {
    expect(initial.showShortcuts).toBe(false);
  });

  it("has selectedAsset null by default", () => {
    expect(initial.selectedAsset).toBeNull();
  });
});

describe("uiSlice – setActiveStrategy", () => {
  it("sets strategy to TWAP", () => {
    const state = reducer(initial, setActiveStrategy("TWAP"));
    expect(state.activeStrategy).toBe("TWAP");
  });

  it("sets strategy to POV", () => {
    const state = reducer(initial, setActiveStrategy("POV"));
    expect(state.activeStrategy).toBe("POV");
  });

  it("sets strategy to VWAP", () => {
    const state = reducer(initial, setActiveStrategy("VWAP"));
    expect(state.activeStrategy).toBe("VWAP");
  });

  it("sets strategy back to LIMIT", () => {
    let state = reducer(initial, setActiveStrategy("TWAP"));
    state = reducer(state, setActiveStrategy("LIMIT"));
    expect(state.activeStrategy).toBe("LIMIT");
  });
});

describe("uiSlice – setActiveSide", () => {
  it("sets side to SELL", () => {
    const state = reducer(initial, setActiveSide("SELL"));
    expect(state.activeSide).toBe("SELL");
  });

  it("sets side back to BUY", () => {
    let state = reducer(initial, setActiveSide("SELL"));
    state = reducer(state, setActiveSide("BUY"));
    expect(state.activeSide).toBe("BUY");
  });
});

describe("uiSlice – toggleShortcuts", () => {
  it("toggles from false to true", () => {
    const state = reducer(initial, toggleShortcuts());
    expect(state.showShortcuts).toBe(true);
  });

  it("toggles from true back to false", () => {
    let state = reducer(initial, toggleShortcuts());
    state = reducer(state, toggleShortcuts());
    expect(state.showShortcuts).toBe(false);
  });
});

describe("uiSlice – hideShortcuts", () => {
  it("sets showShortcuts to false when already false", () => {
    const state = reducer(initial, hideShortcuts());
    expect(state.showShortcuts).toBe(false);
  });

  it("sets showShortcuts to false when true", () => {
    let state = reducer(initial, toggleShortcuts());
    expect(state.showShortcuts).toBe(true);
    state = reducer(state, hideShortcuts());
    expect(state.showShortcuts).toBe(false);
  });
});

describe("uiSlice – setSelectedAsset", () => {
  it("sets selected asset symbol", () => {
    const state = reducer(initial, setSelectedAsset("MSFT"));
    expect(state.selectedAsset).toBe("MSFT");
  });

  it("clears selected asset to null", () => {
    let state = reducer(initial, setSelectedAsset("AAPL"));
    state = reducer(state, setSelectedAsset(null));
    expect(state.selectedAsset).toBeNull();
  });
});

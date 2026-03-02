import { describe, expect, it } from "vitest";
import type { PanelId } from "../windowSlice";
import { panelClosed, panelPopped, windowSlice } from "../windowSlice";

const { reducer } = windowSlice;
const initial = reducer(undefined, { type: "@@init" });

const ALL_PANELS: PanelId[] = ["order-blotter", "algo-monitor", "observability", "market-ladder"];

describe("windowSlice – initial state", () => {
  it("all panels start closed", () => {
    for (const panelId of ALL_PANELS) {
      expect(initial.popOuts[panelId].open).toBe(false);
    }
  });
});

describe("windowSlice – panelPopped", () => {
  for (const panelId of ALL_PANELS) {
    it(`marks ${panelId} as open`, () => {
      const state = reducer(initial, panelPopped({ panelId }));
      expect(state.popOuts[panelId].open).toBe(true);
    });
  }

  it("does not affect other panels when one is popped", () => {
    const state = reducer(initial, panelPopped({ panelId: "order-blotter" }));
    expect(state.popOuts["algo-monitor"].open).toBe(false);
    expect(state.popOuts.observability.open).toBe(false);
    expect(state.popOuts["market-ladder"].open).toBe(false);
  });
});

describe("windowSlice – panelClosed", () => {
  it("marks an open panel as closed", () => {
    let state = reducer(initial, panelPopped({ panelId: "algo-monitor" }));
    expect(state.popOuts["algo-monitor"].open).toBe(true);
    state = reducer(state, panelClosed({ panelId: "algo-monitor" }));
    expect(state.popOuts["algo-monitor"].open).toBe(false);
  });

  it("closing an already-closed panel is idempotent", () => {
    const state = reducer(initial, panelClosed({ panelId: "market-ladder" }));
    expect(state.popOuts["market-ladder"].open).toBe(false);
  });

  it("does not affect other panels when one is closed", () => {
    let state = reducer(initial, panelPopped({ panelId: "order-blotter" }));
    state = reducer(state, panelPopped({ panelId: "algo-monitor" }));
    state = reducer(state, panelClosed({ panelId: "order-blotter" }));
    expect(state.popOuts["algo-monitor"].open).toBe(true);
  });
});

describe("windowSlice – round-trip pop/close", () => {
  it("can pop and close multiple times", () => {
    let state = reducer(initial, panelPopped({ panelId: "observability" }));
    expect(state.popOuts.observability.open).toBe(true);
    state = reducer(state, panelClosed({ panelId: "observability" }));
    expect(state.popOuts.observability.open).toBe(false);
    state = reducer(state, panelPopped({ panelId: "observability" }));
    expect(state.popOuts.observability.open).toBe(true);
  });
});

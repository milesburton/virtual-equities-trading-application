import { describe, expect, it } from "vitest";
import { panelClosed, panelPopped, windowSlice } from "../windowSlice";

const { reducer } = windowSlice;
const initial = reducer(undefined, { type: "@@init" });

// windowSlice now uses a dynamic string-keyed record — no pre-initialised entries.

describe("windowSlice – initial state", () => {
  it("starts with an empty popOuts record", () => {
    expect(initial.popOuts).toEqual({});
  });

  it("unknown panel IDs are treated as closed (undefined coerced to false)", () => {
    expect(initial.popOuts["order-blotter"]?.open ?? false).toBe(false);
  });
});

describe("windowSlice – panelPopped", () => {
  for (const panelId of [
    "order-blotter",
    "algo-monitor",
    "observability",
    "market-ladder",
  ] as const) {
    it(`marks ${panelId} as open`, () => {
      const state = reducer(initial, panelPopped({ panelId }));
      expect(state.popOuts[panelId].open).toBe(true);
    });
  }

  it("does not affect other panels when one is popped", () => {
    const state = reducer(initial, panelPopped({ panelId: "order-blotter" }));
    expect(state.popOuts["algo-monitor"]?.open ?? false).toBe(false);
    expect(state.popOuts.observability?.open ?? false).toBe(false);
    expect(state.popOuts["market-ladder"]?.open ?? false).toBe(false);
  });
});

describe("windowSlice – panelClosed", () => {
  it("marks an open panel as closed", () => {
    let state = reducer(initial, panelPopped({ panelId: "algo-monitor" }));
    expect(state.popOuts["algo-monitor"].open).toBe(true);
    state = reducer(state, panelClosed({ panelId: "algo-monitor" }));
    expect(state.popOuts["algo-monitor"].open).toBe(false);
  });

  it("closing an already-closed panel is idempotent (entry absent → still false)", () => {
    const state = reducer(initial, panelClosed({ panelId: "market-ladder" }));
    expect(state.popOuts["market-ladder"]?.open ?? false).toBe(false);
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

  it("works with arbitrary instance IDs (multi-instance panels)", () => {
    const id = "order-blotter-1714000000000";
    let state = reducer(initial, panelPopped({ panelId: id }));
    expect(state.popOuts[id].open).toBe(true);
    state = reducer(state, panelClosed({ panelId: id }));
    expect(state.popOuts[id].open).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import type { ObsEvent } from "../../types";
import { eventReceived, historicEventsLoaded, observabilitySlice } from "../observabilitySlice";

const { reducer } = observabilitySlice;

const initialState = { events: [] };

function makeEvent(type: string, ts = Date.now()): ObsEvent {
  return { type, ts, payload: { value: 1 } };
}

// ─── historicEventsLoaded ─────────────────────────────────────────────────────

describe("historicEventsLoaded", () => {
  it("replaces empty events with the provided array", () => {
    const events = [makeEvent("order.filled"), makeEvent("order.new")];
    const state = reducer(initialState, historicEventsLoaded(events));
    expect(state.events).toHaveLength(2);
    expect(state.events[0].type).toBe("order.filled");
  });

  it("replaces existing events entirely", () => {
    const existing = [makeEvent("old.event")];
    const stateWithExisting = { events: existing };

    const newEvents = [makeEvent("new.event.1"), makeEvent("new.event.2")];
    const state = reducer(stateWithExisting, historicEventsLoaded(newEvents));
    expect(state.events).toHaveLength(2);
    expect(state.events[0].type).toBe("new.event.1");
  });

  it("sets events to empty array when passed []", () => {
    const stateWithEvents = { events: [makeEvent("something")] };
    const state = reducer(stateWithEvents, historicEventsLoaded([]));
    expect(state.events).toHaveLength(0);
  });
});

// ─── eventReceived ────────────────────────────────────────────────────────────

describe("eventReceived", () => {
  it("prepends the new event to the front of the list", () => {
    const existing = [makeEvent("old")];
    const state = reducer({ events: existing }, eventReceived(makeEvent("new")));
    expect(state.events[0].type).toBe("new");
    expect(state.events[1].type).toBe("old");
  });

  it("adds first event when list is empty", () => {
    const state = reducer(initialState, eventReceived(makeEvent("first")));
    expect(state.events).toHaveLength(1);
    expect(state.events[0].type).toBe("first");
  });

  it("caps the events array at 1000 entries", () => {
    const events: ObsEvent[] = Array.from({ length: 999 }, (_, i) => makeEvent(`event-${i}`));
    let state = { events };
    state = reducer(state, eventReceived(makeEvent("event-999")));
    expect(state.events).toHaveLength(1000);

    // Adding one more should drop the oldest (last element)
    state = reducer(state, eventReceived(makeEvent("event-1000")));
    expect(state.events).toHaveLength(1000);
    expect(state.events[0].type).toBe("event-1000");
  });

  it("the newest event is always at index 0", () => {
    let state = initialState;
    for (let i = 0; i < 5; i++) {
      state = reducer(state, eventReceived(makeEvent(`event-${i}`)));
    }
    expect(state.events[0].type).toBe("event-4");
    expect(state.events[4].type).toBe("event-0");
  });

  it("preserves event payload", () => {
    const event: ObsEvent = {
      type: "trade.executed",
      ts: 12345,
      payload: { qty: 100, price: 150 },
    };
    const state = reducer(initialState, eventReceived(event));
    expect(state.events[0].payload).toEqual({ qty: 100, price: 150 });
  });
});

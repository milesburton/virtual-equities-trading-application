import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";
import { observabilitySlice } from "../../store/observabilitySlice";
import { windowSlice } from "../../store/windowSlice";
import type { ObsEvent } from "../../types";
import { ObservabilityPanel } from "../ObservabilityPanel";

function makeEvent(overrides: Partial<ObsEvent> = {}): ObsEvent {
  return {
    type: "order_submitted",
    ts: Date.now(),
    payload: { orderId: "order-1" },
    ...overrides,
  };
}

function makeStore(events: ObsEvent[] = []) {
  return configureStore({
    reducer: {
      observability: observabilitySlice.reducer,
      windows: windowSlice.reducer,
    },
    preloadedState: {
      observability: { events },
    },
  });
}

function renderPanel(events: ObsEvent[] = []) {
  return render(
    <Provider store={makeStore(events)}>
      <ObservabilityPanel />
    </Provider>
  );
}

describe("ObservabilityPanel – empty state", () => {
  it("renders the Observability header", () => {
    renderPanel();
    expect(screen.getByText(/Observability/i)).toBeInTheDocument();
  });

  it("shows 'No events yet' when empty", () => {
    renderPanel();
    expect(screen.getByText(/No events yet/i)).toBeInTheDocument();
  });

  it("renders the Replay button", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: /Replay/i })).toBeInTheDocument();
  });
});

describe("ObservabilityPanel – with events", () => {
  it("renders event type label", () => {
    renderPanel([makeEvent({ type: "order_submitted" })]);
    expect(screen.getByText("order_submitted")).toBeInTheDocument();
  });

  it("renders multiple events", () => {
    renderPanel([
      makeEvent({ type: "order_submitted" }),
      makeEvent({ type: "child_created" }),
      makeEvent({ type: "order_patch" }),
    ]);
    expect(screen.getByText("order_submitted")).toBeInTheDocument();
    expect(screen.getByText("child_created")).toBeInTheDocument();
    expect(screen.getByText("order_patch")).toBeInTheDocument();
  });

  it("renders payload as formatted JSON", () => {
    renderPanel([makeEvent({ payload: { orderId: "abc-123" } })]);
    expect(screen.getByText(/abc-123/)).toBeInTheDocument();
  });

  it("shows — for timestamp when event has no ts", () => {
    renderPanel([makeEvent({ ts: undefined })]);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("ObservabilityPanel – Replay button", () => {
  it("calls window.open with a blob URL on replay click", () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    // jsdom does not implement URL.createObjectURL — stub it on globalThis
    const createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    Object.defineProperty(globalThis.URL, "createObjectURL", {
      value: createObjectURL,
      writable: true,
      configurable: true,
    });

    renderPanel([makeEvent()]);
    fireEvent.click(screen.getByRole("button", { name: /Replay/i }));

    expect(createObjectURL).toHaveBeenCalled();
    expect(openSpy).toHaveBeenCalledWith("blob:mock-url", "_blank");

    openSpy.mockRestore();
  });
});

describe("ObservabilityPanel – event cap", () => {
  it("renders at most 200 events in the list", () => {
    // Feed in 250 events
    const events: ObsEvent[] = Array.from({ length: 250 }, (_, i) =>
      makeEvent({ type: `event_${i}`, ts: Date.now() + i })
    );
    renderPanel(events);
    // The component slices events to latest 200 (events[0..199])
    // event_0 is the most recent (first in array = newest first), event_249 oldest
    // We verify event_0 (first) IS shown and event_249 (201st+) is NOT
    expect(screen.getByText("event_0")).toBeInTheDocument();
    expect(screen.queryByText("event_249")).not.toBeInTheDocument();
  });
});

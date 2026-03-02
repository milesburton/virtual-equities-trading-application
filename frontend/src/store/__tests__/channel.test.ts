import { configureStore } from "@reduxjs/toolkit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createBroadcastChannelMiddleware,
  listenForStateRequests,
  requestStateFromMainWindow,
} from "../channel";
import { uiSlice } from "../uiSlice";

// ─── BroadcastChannel mock ───────────────────────────────────────────────────
// We override the global with an instance that lets us inspect calls and
// trigger messages from the "other side" of the channel.

interface MockChannelInstance {
  name: string;
  onmessage: ((ev: MessageEvent) => void) | null;
  postMessage: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

let instances: MockChannelInstance[] = [];

function MockBroadcastChannel(name: string): MockChannelInstance {
  const inst: MockChannelInstance = {
    name,
    onmessage: null,
    postMessage: vi.fn(),
    close: vi.fn(),
  };
  instances.push(inst);
  return inst;
}

beforeEach(() => {
  instances = [];
  // Replace the global stub from setupTests with our controllable mock
  globalThis.BroadcastChannel = MockBroadcastChannel as unknown as typeof BroadcastChannel;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeStore() {
  return configureStore({
    reducer: { ui: uiSlice.reducer },
    middleware: (getDefault) => getDefault().concat(createBroadcastChannelMiddleware()),
  });
}

describe("createBroadcastChannelMiddleware – outbound", () => {
  it("posts domain actions to BroadcastChannel", () => {
    const store = makeStore();
    store.dispatch(uiSlice.actions.setActiveStrategy("TWAP"));
    const ch = instances[0];
    expect(ch.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ui/setActiveStrategy" })
    );
  });

  it("does NOT post RTK Query internal actions", () => {
    const store = makeStore();
    store.dispatch({ type: "servicesApi/executeQuery/fulfilled", payload: {} });
    const ch = instances[0];
    expect(ch.postMessage).not.toHaveBeenCalled();
  });

  it("does NOT echo actions that arrived from the channel (_fromChannel flag)", () => {
    const store = makeStore();
    store.dispatch({
      type: "ui/setActiveStrategy",
      payload: "POV",
      _fromChannel: true,
    });
    const ch = instances[0];
    expect(ch.postMessage).not.toHaveBeenCalled();
  });

  it("strips _fromChannel before posting clean action", () => {
    const store = makeStore();
    store.dispatch(uiSlice.actions.toggleShortcuts());
    const ch = instances[0];
    const posted = ch.postMessage.mock.calls[0][0] as Record<string, unknown>;
    expect(posted._fromChannel).toBeUndefined();
  });
});

describe("createBroadcastChannelMiddleware – inbound", () => {
  it("re-dispatches messages received from the channel", () => {
    const store = makeStore();
    expect(store.getState().ui.activeStrategy).toBe("LIMIT");

    const ch = instances[0];
    // Simulate message arriving from another window
    ch.onmessage?.({
      data: { type: "ui/setActiveStrategy", payload: "VWAP" },
    } as MessageEvent);

    expect(store.getState().ui.activeStrategy).toBe("VWAP");
  });

  it("inbound action does not get re-posted to channel (no echo loop)", () => {
    const store = makeStore();
    const ch = instances[0];

    // Simulate inbound message
    ch.onmessage?.({
      data: { type: "ui/setActiveSide", payload: "SELL" },
    } as MessageEvent);

    // The state should have updated (action was applied)
    expect(store.getState().ui.activeSide).toBe("SELL");

    // postMessage should NOT have been called for the inbound re-dispatch
    // (only 0 calls: the inbound action has _fromChannel=true so it's not forwarded)
    expect(ch.postMessage).not.toHaveBeenCalled();
  });
});

describe("listenForStateRequests", () => {
  it("responds to REQUEST_STATE with FULL_STATE", () => {
    const getState = vi.fn(() => ({ ui: { activeStrategy: "LIMIT" } }));
    listenForStateRequests(getState);

    const ch = instances[0];
    ch.onmessage?.({ data: { type: "REQUEST_STATE" } } as MessageEvent);

    expect(ch.postMessage).toHaveBeenCalledWith({
      type: "FULL_STATE",
      state: { ui: { activeStrategy: "LIMIT" } },
    });
  });

  it("ignores messages that are not REQUEST_STATE", () => {
    const getState = vi.fn(() => ({}));
    listenForStateRequests(getState);

    const ch = instances[0];
    ch.onmessage?.({ data: { type: "SOMETHING_ELSE" } } as MessageEvent);

    expect(ch.postMessage).not.toHaveBeenCalled();
  });

  it("returns a cleanup function that closes the channel", () => {
    const getState = vi.fn(() => ({}));
    const cleanup = listenForStateRequests(getState);
    cleanup();
    const ch = instances[0];
    expect(ch.close).toHaveBeenCalled();
  });
});

describe("requestStateFromMainWindow", () => {
  it("sends REQUEST_STATE and resolves with FULL_STATE payload", async () => {
    const fakeState = { market: { prices: { AAPL: 155 } } };

    // Respond synchronously after the request is posted
    const promise = requestStateFromMainWindow();

    // Find the channel created by requestStateFromMainWindow
    const ch = instances[instances.length - 1];
    ch.onmessage?.({ data: { type: "FULL_STATE", state: fakeState } } as MessageEvent);

    const result = await promise;
    expect(result).toEqual(fakeState);
  });

  it("resolves with empty object on timeout", async () => {
    vi.useFakeTimers();
    const promise = requestStateFromMainWindow();
    vi.advanceTimersByTime(3001);
    const result = await promise;
    expect(result).toEqual({});
    vi.useRealTimers();
  });
});

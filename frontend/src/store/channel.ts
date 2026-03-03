/**
 * BroadcastChannel middleware — syncs Redux domain actions across all open windows.
 *
 * Abstraction point: swap BroadcastChannel for OpenFin InterApplicationBus
 * or Electron ipcRenderer by replacing only this file.
 */
import type { Middleware } from "@reduxjs/toolkit";

const CHANNEL_NAME = "trading-app";

// Only sync domain slices — exclude RTK Query internal actions
function isSyncableAction(type: string): boolean {
  return (
    type.startsWith("market/") ||
    type.startsWith("orders/") ||
    type.startsWith("ui/") ||
    type.startsWith("windows/") ||
    type.startsWith("observability/") ||
    type.startsWith("channels/")
  );
}

export function createBroadcastChannelMiddleware(): Middleware {
  // Graceful noop when BroadcastChannel is unavailable (test/SSR environments)
  if (typeof BroadcastChannel === "undefined") {
    return (_store) => (next) => (action) => next(action);
  }

  const channel = new BroadcastChannel(CHANNEL_NAME);

  return (storeAPI) => {
    channel.onmessage = (event: MessageEvent) => {
      // Re-dispatch with _fromChannel flag to prevent echo loop
      const incoming = event.data as { type: string };
      storeAPI.dispatch({ ...incoming, _fromChannel: true });
    };

    return (next) => (action: unknown) => {
      const result = next(action);
      const a = action as { type?: string; _fromChannel?: boolean };
      // Forward to other windows only for domain actions not already received from channel
      if (a.type && !a._fromChannel && isSyncableAction(a.type)) {
        // Omit _fromChannel before posting so recipient windows see a clean action
        const cleanAction: Record<string, unknown> = { ...a };
        delete cleanAction._fromChannel;
        channel.postMessage(cleanAction);
      }
      return result;
    };
  };
}

/** Call from main window to respond to state requests from pop-out windows */
export function listenForStateRequests(getState: () => unknown): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent) => {
    if ((event.data as { type: string }).type === "REQUEST_STATE") {
      channel.postMessage({ type: "FULL_STATE", state: getState() });
    }
  };
  return () => channel.close();
}

/** Called from pop-out window to request initial state from main window */
export function requestStateFromMainWindow(): Promise<unknown> {
  return new Promise((resolve) => {
    if (typeof BroadcastChannel === "undefined") {
      resolve({});
      return;
    }
    const channel = new BroadcastChannel(CHANNEL_NAME);
    const timeout = setTimeout(() => {
      channel.close();
      resolve({});
    }, 3000);
    channel.onmessage = (event: MessageEvent) => {
      if ((event.data as { type: string }).type === "FULL_STATE") {
        clearTimeout(timeout);
        channel.close();
        resolve((event.data as { state: unknown }).state);
      }
    };
    channel.postMessage({ type: "REQUEST_STATE" });
  });
}

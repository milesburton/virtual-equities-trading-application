import type { Middleware } from "@reduxjs/toolkit";
import type { ObsEvent } from "../../types.ts";
import { observabilitySlice } from "../observabilitySlice.ts";

const OBS_URL = import.meta.env.VITE_OBS_URL ?? "http://localhost:5007";

export const observabilityMiddleware: Middleware = (storeAPI) => {
  let es: EventSource | null = null;
  let started = false;

  function connect() {
    // Fetch historic events
    fetch(`${OBS_URL}/events`)
      .then(async (r) => {
        if (!r.ok) return;
        const data = (await r.json()) as ObsEvent[];
        storeAPI.dispatch(observabilitySlice.actions.historicEventsLoaded(data ?? []));
      })
      .catch(() => {});

    // Connect SSE stream
    es = new EventSource(`${OBS_URL}/stream`);
    es.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data as string) as ObsEvent;
        storeAPI.dispatch(observabilitySlice.actions.eventReceived(parsed));
      } catch {
        // ignore parse errors
      }
    };
  }

  return (next) => (action: unknown) => {
    if (!started) {
      started = true;
      connect();
    }
    if ((action as { type: string }).type === "observability/stop") {
      es?.close();
    }
    return next(action);
  };
};

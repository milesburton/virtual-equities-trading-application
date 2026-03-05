import type { Middleware } from "@reduxjs/toolkit";
import type { ObsEvent } from "../../types.ts";
import { observabilitySlice } from "../observabilitySlice.ts";

const _origin = typeof window !== "undefined" ? window.location.origin : "";
const OBS_URL = import.meta.env.VITE_OBS_URL ?? `${_origin}/api/observability`;

/** Post a client-side user action to the observability service (best-effort, fire-and-forget). */
function postUserAction(type: string, payload: Record<string, unknown>) {
  const evt: ObsEvent = { type, ts: Date.now(), payload };
  fetch(`${OBS_URL}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(evt),
    credentials: "include",
  }).catch(() => {});
}

export const observabilityMiddleware: Middleware = (storeAPI) => {
  let es: EventSource | null = null;
  let started = false;
  let reconnectDelay = 2_000;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function connect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    fetch(`${OBS_URL}/events`)
      .then(async (r) => {
        if (!r.ok) return;
        const data = (await r.json()) as ObsEvent[];
        storeAPI.dispatch(observabilitySlice.actions.historicEventsLoaded(data ?? []));
      })
      .catch(() => {});

    es = new EventSource(`${OBS_URL}/stream`);

    es.onopen = () => {
      reconnectDelay = 2_000;
    };

    es.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data as string) as ObsEvent;
        storeAPI.dispatch(observabilitySlice.actions.eventReceived(parsed));
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      es?.close();
      es = null;
      reconnectTimer = setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
        connect();
      }, reconnectDelay);
    };
  }

  return (next) => (action: unknown) => {
    if (!started) {
      started = true;
      connect();
    }
    if ((action as { type: string }).type === "observability/stop") {
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    }

    // ── Client-side user action logging ──────────────────────────────────────
    // These events are not on the message bus, so we POST them directly to
    // the observability service to appear in the audit trail.
    const actionType = (action as { type: string }).type;

    if (actionType === "auth/setUser" || actionType === "auth/setUserWithLimits") {
      // User logged in — extract user from whichever payload shape is used
      const a = action as {
        payload: { user?: { id: string; role: string }; id?: string; role?: string };
      };
      const user =
        (a.payload as { user?: { id: string; role: string } }).user ??
        (a.payload as { id: string; role: string });
      postUserAction("user.login", { userId: user.id, role: user.role, source: "frontend" });
    }

    if (actionType === "auth/clearUser") {
      // User logged out — read from state before the reducer clears it
      const state = storeAPI.getState() as { auth: { user: { id: string; role: string } | null } };
      const user = state.auth.user;
      if (user) {
        postUserAction("user.logout", { userId: user.id, role: user.role, source: "frontend" });
      }
    }

    if (actionType === "orders/submit/pending") {
      // Order submission attempt — before it reaches the gateway
      const a = action as {
        meta: {
          arg: {
            asset: string;
            side: string;
            quantity: number;
            limitPrice: number;
            algoParams: { strategy?: string };
          };
        };
      };
      const state = storeAPI.getState() as { auth: { user: { id: string; role: string } | null } };
      postUserAction("user.order_attempt", {
        userId: state.auth.user?.id,
        role: state.auth.user?.role,
        asset: a.meta.arg.asset,
        side: a.meta.arg.side,
        quantity: a.meta.arg.quantity,
        limitPrice: a.meta.arg.limitPrice,
        strategy: a.meta.arg.algoParams?.strategy ?? "LIMIT",
      });
    }

    return next(action);
  };
};

// FIX Gateway middleware
// Connects to /ws/fix (the fixGateway WS bridge), maintains a FIXT 1.1 session,
// sends NewOrderSingle on orderAdded, and dispatches fillReceived on ExecReports.

import type { Middleware } from "@reduxjs/toolkit";
import { splitMessages } from "../../fix/fixCodec.ts";
import { FIXSession } from "../../fix/fixSession.ts";
import { fillReceived, orderAdded } from "../ordersSlice.ts";

const _origin = typeof window !== "undefined" ? window.location.origin : "";
const _wsOrigin = _origin.replace(/^http/, "ws");
const FIX_WS_URL = import.meta.env.VITE_FIX_WS_URL ?? `${_wsOrigin}/ws/fix`;

export const fixMiddleware: Middleware = (storeAPI) => {
  let ws: WebSocket | null = null;
  let session: FIXSession | null = null;
  let buffer = "";
  let reconnectDelay = 2_000;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let started = false;

  function connect(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    ws = new WebSocket(FIX_WS_URL);

    session = new FIXSession({
      senderCompID: "TRADER",
      targetCompID: "EXCHANGE",
      heartBtInt: 30,
      onSend: (msg: string) => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(msg);
        }
      },
      onExecReport: (report) => {
        storeAPI.dispatch(
          fillReceived({
            clOrdId: report.clOrdId,
            filledQty: report.filledQty,
            avgFillPrice: report.avgFillPrice,
            leavesQty: report.leavesQty,
          })
        );
      },
      onStateChange: (state) => {
        console.log(`[FIX] Session state → ${state}`);
      },
    });

    ws.onopen = () => {
      console.log("[FIX] WebSocket connected — sending Logon");
      reconnectDelay = 2_000;
      buffer = "";
      session?.sendLogon(true);
    };

    ws.onmessage = (event) => {
      buffer += typeof event.data === "string" ? event.data : "";
      const { messages, remainder } = splitMessages(buffer);
      buffer = remainder;
      for (const msg of messages) {
        session?.handleInbound(msg);
      }
    };

    ws.onclose = () => {
      console.warn(`[FIX] WebSocket closed — reconnecting in ${reconnectDelay}ms`);
      session?.disconnect();
      reconnectTimer = setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
        connect();
      }, reconnectDelay);
    };

    ws.onerror = () => ws?.close();
  }

  return (next) => (action: unknown) => {
    const result = next(action);

    if (!started) {
      started = true;
      connect();
    }

    // Intercept orderAdded to send NewOrderSingle over FIX
    if (orderAdded.match(action as Parameters<typeof orderAdded.match>[0])) {
      const order = (action as ReturnType<typeof orderAdded>).payload;
      if (session?.sessionState === "ACTIVE") {
        session.sendNewOrderSingle(order);
      }
    }

    return result;
  };
};

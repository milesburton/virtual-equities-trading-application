import { createListenerMiddleware } from "@reduxjs/toolkit";
import { v4 as uuidv4 } from "uuid";
import type { Dispatch, ListenerEffectAPI, UnknownAction } from "@reduxjs/toolkit";
import type { ChildOrder, MarketPrices, ObsEvent, OrderRecord } from "../../types.ts";
import { marketSlice } from "../marketSlice.ts";
import { ordersSlice } from "../ordersSlice.ts";

// Use structural types to avoid circular import with store/index.ts
interface SimState {
  market: { prices: MarketPrices };
  orders: { orders: OrderRecord[] };
}
type SimListenerAPI = ListenerEffectAPI<SimState, Dispatch<UnknownAction>>;

const TWAP_INTERVAL_MS = 5000;
const POV_INTERVAL_MS = 5000;
const VWAP_INTERVAL_MS = 5000;
const OBS_URL = import.meta.env.VITE_OBS_URL ?? "http://localhost:5007";

function sendObsEvent(evt: Partial<ObsEvent>): void {
  fetch(`${OBS_URL}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(evt),
  }).catch(() => {});
}

function startTwapSimulation(order: OrderRecord, api: SimListenerAPI): void {
  api.dispatch(ordersSlice.actions.orderPatched({ id: order.id, patch: { status: "executing" } }));
  const params = order.algoParams.strategy === "TWAP" ? order.algoParams : null;
  const durationMs = order.expiresAt - Date.now();
  const numSlices = params?.numSlices ?? Math.max(1, Math.round(durationMs / TWAP_INTERVAL_MS));
  const intervalMs = durationMs / numSlices;
  const sliceSize = order.quantity / numSlices;
  let filled = 0;
  let sliceIndex = 0;

  const handle = setInterval(() => {
    const child: ChildOrder = {
      id: uuidv4(),
      parentId: order.id,
      asset: order.asset,
      side: order.side,
      quantity: sliceSize,
      limitPrice: order.limitPrice,
      status: "filled",
      filled: sliceSize,
      submittedAt: Date.now(),
    };
    api.dispatch(ordersSlice.actions.childAdded({ parentId: order.id, child }));
    filled = Math.min(filled + sliceSize, order.quantity);
    sliceIndex++;
    const done = sliceIndex >= numSlices || filled >= order.quantity;
    api.dispatch(ordersSlice.actions.orderPatched({ id: order.id, patch: { filled, status: done ? "filled" : "executing" } }));
    if (done) clearInterval(handle);
  }, intervalMs);

  setTimeout(() => {
    clearInterval(handle);
    const current = api.getState().orders.orders.find((o) => o.id === order.id);
    if (current && current.status !== "filled") {
      api.dispatch(ordersSlice.actions.orderPatched({ id: order.id, patch: { status: "expired" } }));
    }
  }, order.expiresAt - Date.now());
}

function startPovSimulation(order: OrderRecord, api: SimListenerAPI): void {
  api.dispatch(ordersSlice.actions.orderPatched({ id: order.id, patch: { status: "executing" } }));
  const params = order.algoParams.strategy === "POV" ? order.algoParams : null;
  const participationRate = params?.participationRate ?? 10;
  const minSlice = params?.minSliceSize ?? 0;
  const maxSlice = params?.maxSliceSize ?? Number.POSITIVE_INFINITY;
  let filled = 0;

  const handle = setInterval(() => {
    const marketVolume = Math.random() * 1000;
    const rawSlice = (participationRate / 100) * marketVolume;
    const slice = Math.min(Math.max(rawSlice, minSlice), maxSlice, order.quantity - filled);
    if (slice > 0) {
      const child: ChildOrder = {
        id: uuidv4(),
        parentId: order.id,
        asset: order.asset,
        side: order.side,
        quantity: slice,
        limitPrice: order.limitPrice,
        status: "filled",
        filled: slice,
        submittedAt: Date.now(),
      };
      api.dispatch(ordersSlice.actions.childAdded({ parentId: order.id, child }));
    }
    filled += slice;
    const done = filled >= order.quantity;
    api.dispatch(ordersSlice.actions.orderPatched({ id: order.id, patch: { filled, status: done ? "filled" : "executing" } }));
    if (done) clearInterval(handle);
  }, POV_INTERVAL_MS);

  setTimeout(() => {
    clearInterval(handle);
    const current = api.getState().orders.orders.find((o) => o.id === order.id);
    if (current && current.status !== "filled") {
      api.dispatch(ordersSlice.actions.orderPatched({ id: order.id, patch: { status: "expired" } }));
    }
  }, order.expiresAt - Date.now());
}

function startVwapSimulation(order: OrderRecord, api: SimListenerAPI): void {
  api.dispatch(ordersSlice.actions.orderPatched({ id: order.id, patch: { status: "executing" } }));
  const params = order.algoParams.strategy === "VWAP" ? order.algoParams : null;
  const maxDev = params?.maxDeviation ?? 0.005;
  const durationMs = order.expiresAt - Date.now();
  const numSlices = Math.max(1, Math.round(durationMs / VWAP_INTERVAL_MS));
  const sliceSize = order.quantity / numSlices;
  let filled = 0;
  let sliceIndex = 0;

  const handle = setInterval(() => {
    // Read live price from store at tick time — no stale closure
    const currentPrice = api.getState().market.prices[order.asset] ?? order.limitPrice;
    const deviation = Math.abs(currentPrice - order.limitPrice) / order.limitPrice;
    if (deviation > maxDev) return;

    const child: ChildOrder = {
      id: uuidv4(),
      parentId: order.id,
      asset: order.asset,
      side: order.side,
      quantity: sliceSize,
      limitPrice: currentPrice,
      status: "filled",
      filled: sliceSize,
      submittedAt: Date.now(),
    };
    api.dispatch(ordersSlice.actions.childAdded({ parentId: order.id, child }));
    filled = Math.min(filled + sliceSize, order.quantity);
    sliceIndex++;
    const done = sliceIndex >= numSlices || filled >= order.quantity;
    api.dispatch(ordersSlice.actions.orderPatched({ id: order.id, patch: { filled, status: done ? "filled" : "executing" } }));
    if (done) clearInterval(handle);
  }, VWAP_INTERVAL_MS);

  setTimeout(() => {
    clearInterval(handle);
    const current = api.getState().orders.orders.find((o) => o.id === order.id);
    if (current && current.status !== "filled") {
      api.dispatch(ordersSlice.actions.orderPatched({ id: order.id, patch: { status: "expired" } }));
    }
  }, order.expiresAt - Date.now());
}

export const simulationMiddleware = createListenerMiddleware();

const startAppListening = simulationMiddleware.startListening.withTypes<SimState, Dispatch<UnknownAction>>();

// LIMIT: check fill/expire on every market tick
startAppListening({
  actionCreator: marketSlice.actions.tickReceived,
  effect: (_action, api) => {
    api.dispatch(ordersSlice.actions.limitOrdersChecked(api.getState().market.prices));
  },
});

// TWAP/POV/VWAP: start simulations when order is added
startAppListening({
  actionCreator: ordersSlice.actions.orderAdded,
  effect: (action, api) => {
    const order = action.payload;
    if (order.strategy === "TWAP") startTwapSimulation(order, api);
    if (order.strategy === "POV") startPovSimulation(order, api);
    if (order.strategy === "VWAP") startVwapSimulation(order, api);
  },
});

// Observability side-effects
startAppListening({
  actionCreator: ordersSlice.actions.orderAdded,
  effect: (action) => {
    sendObsEvent({ type: "order_submitted", ts: Date.now(), payload: { order: action.payload } });
  },
});
startAppListening({
  actionCreator: ordersSlice.actions.orderPatched,
  effect: (action) => {
    sendObsEvent({ type: "order_patch", ts: Date.now(), payload: action.payload });
  },
});
startAppListening({
  actionCreator: ordersSlice.actions.childAdded,
  effect: (action) => {
    sendObsEvent({ type: "child_created", ts: Date.now(), payload: action.payload });
  },
});

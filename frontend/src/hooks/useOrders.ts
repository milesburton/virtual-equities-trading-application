import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type { ChildOrder, MarketPrices, ObsEvent, OrderRecord, Strategy, Trade } from "../types.ts";

const ENDPOINTS: Record<Strategy, string> = {
  LIMIT: import.meta.env.VITE_LIMIT_URL ?? "http://localhost:5003",
  TWAP: import.meta.env.VITE_TWAP_URL ?? "http://localhost:5004",
  POV: import.meta.env.VITE_POV_URL ?? "http://localhost:5005",
  VWAP: import.meta.env.VITE_VWAP_URL ?? "http://localhost:5006",
};

const TWAP_INTERVAL_MS = 5000;
const POV_INTERVAL_MS = 5000;
const VWAP_INTERVAL_MS = 5000;

export function useOrders(prices: MarketPrices) {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  const OBS_URL = import.meta.env.VITE_OBS_URL ?? "http://localhost:5007";

  const sendEvent = useCallback((evt: Partial<ObsEvent>) => {
    try {
      fetch(`${OBS_URL}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(evt),
      }).catch(() => {});
    } catch {}
  }, []);

  const patchOrder = useCallback(
    (id: string, patch: Partial<OrderRecord>) => {
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
      sendEvent({ type: "order_patch", ts: Date.now(), payload: { id, patch } });
    },
    [sendEvent]
  );

  const addChildOrder = useCallback(
    (parentId: string, child: ChildOrder) => {
      setOrders((prev) =>
        prev.map((o) => (o.id === parentId ? { ...o, children: [...o.children, child] } : o))
      );
      sendEvent({ type: "child_created", ts: Date.now(), payload: { parentId, child } });
    },
    [sendEvent]
  );

  const startSimulation = useCallback(
    (order: OrderRecord) => {
      if (order.strategy === "TWAP") {
        patchOrder(order.id, { status: "executing" });
        const params = order.algoParams.strategy === "TWAP" ? order.algoParams : null;
        const durationMs = order.expiresAt - Date.now();
        const numSlices =
          params?.numSlices ?? Math.max(1, Math.round(durationMs / TWAP_INTERVAL_MS));
        const intervalMs = durationMs / numSlices;
        const sliceSize = order.quantity / numSlices;
        let filled = 0;
        let sliceIndex = 0;

        const handle = setInterval(() => {
          const childId = uuidv4();
          const child: ChildOrder = {
            id: childId,
            parentId: order.id,
            asset: order.asset,
            side: order.side,
            quantity: sliceSize,
            limitPrice: order.limitPrice,
            status: "filled",
            filled: sliceSize,
            submittedAt: Date.now(),
          };
          addChildOrder(order.id, child);

          filled = Math.min(filled + sliceSize, order.quantity);
          sliceIndex++;
          const done = sliceIndex >= numSlices || filled >= order.quantity;
          patchOrder(order.id, { filled, status: done ? "filled" : "executing" });
          if (done) {
            clearInterval(handle);
            timers.current.delete(order.id);
          }
        }, intervalMs);

        timers.current.set(order.id, handle);

        setTimeout(() => {
          clearInterval(handle);
          timers.current.delete(order.id);
          setOrders((prev) =>
            prev.map((o) =>
              o.id === order.id && o.status !== "filled" ? { ...o, status: "expired" } : o
            )
          );
        }, order.expiresAt - Date.now());
      } else if (order.strategy === "POV") {
        patchOrder(order.id, { status: "executing" });
        const params = order.algoParams.strategy === "POV" ? order.algoParams : null;
        const participationRate = params?.participationRate ?? 10;
        const minSlice = params?.minSliceSize ?? 0;
        const maxSlice = params?.maxSliceSize ?? Infinity;
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
            addChildOrder(order.id, child);
          }
          filled += slice;
          const done = filled >= order.quantity;
          patchOrder(order.id, { filled, status: done ? "filled" : "executing" });
          if (done) {
            clearInterval(handle);
            timers.current.delete(order.id);
          }
        }, POV_INTERVAL_MS);

        timers.current.set(order.id, handle);

        setTimeout(() => {
          clearInterval(handle);
          timers.current.delete(order.id);
          setOrders((prev) =>
            prev.map((o) =>
              o.id === order.id && o.status !== "filled" ? { ...o, status: "expired" } : o
            )
          );
        }, order.expiresAt - Date.now());
      } else if (order.strategy === "VWAP") {
        patchOrder(order.id, { status: "executing" });
        const params = order.algoParams.strategy === "VWAP" ? order.algoParams : null;
        const maxDev = params?.maxDeviation ?? 0.005;
        const durationMs = order.expiresAt - Date.now();
        const numSlices = Math.max(1, Math.round(durationMs / VWAP_INTERVAL_MS));
        const sliceSize = order.quantity / numSlices;
        let filled = 0;
        let sliceIndex = 0;

        const handle = setInterval(() => {
          const currentPrice = prices[order.asset] ?? order.limitPrice;
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
          addChildOrder(order.id, child);

          filled = Math.min(filled + sliceSize, order.quantity);
          sliceIndex++;
          const done = sliceIndex >= numSlices || filled >= order.quantity;
          patchOrder(order.id, { filled, status: done ? "filled" : "executing" });
          if (done) {
            clearInterval(handle);
            timers.current.delete(order.id);
          }
        }, VWAP_INTERVAL_MS);

        timers.current.set(order.id, handle);

        setTimeout(() => {
          clearInterval(handle);
          timers.current.delete(order.id);
          setOrders((prev) =>
            prev.map((o) =>
              o.id === order.id && o.status !== "filled" ? { ...o, status: "expired" } : o
            )
          );
        }, order.expiresAt - Date.now());
      }
    },
    [patchOrder, addChildOrder, prices]
  );

  useEffect(() => {
    const now = Date.now();
    setOrders((prev) =>
      prev.map((order) => {
        if (order.strategy !== "LIMIT") return order;
        if (order.status === "filled" || order.status === "expired") return order;

        const marketPrice = prices[order.asset];
        if (!marketPrice) return order;

        if (now >= order.expiresAt) return { ...order, status: "expired" };

        const triggered =
          (order.side === "BUY" && marketPrice <= order.limitPrice) ||
          (order.side === "SELL" && marketPrice >= order.limitPrice);

        if (triggered) return { ...order, status: "filled", filled: order.quantity };

        if (order.status === "queued") return { ...order, status: "executing" };

        return order;
      })
    );
  }, [prices]);

  useEffect(() => {
    return () => {
      for (const handle of timers.current.values()) clearInterval(handle);
    };
  }, []);

  const submitOrder = useCallback(
    async (trade: Trade): Promise<void> => {
      const strategy = trade.algoParams.strategy;
      const id = uuidv4();
      const order: OrderRecord = {
        id,
        submittedAt: Date.now(),
        asset: trade.asset,
        side: trade.side,
        quantity: trade.quantity,
        limitPrice: trade.limitPrice,
        expiresAt: Date.now() + trade.expiresAt * 1000,
        strategy,
        status: "queued",
        filled: 0,
        algoParams: trade.algoParams,
        children: [],
      };

      setOrders((prev) => [order, ...prev]);
      sendEvent({ type: "order_submitted", ts: Date.now(), payload: { order } });

      fetch(ENDPOINTS[strategy], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trade),
      }).catch(() => {});

      startSimulation(order);
    },
    [startSimulation, sendEvent]
  );

  return { orders, submitOrder };
}

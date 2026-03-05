import type { PayloadAction } from "@reduxjs/toolkit";
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { v4 as uuidv4 } from "uuid";
import type { ChildOrder, MarketPrices, OrderRecord, Trade } from "../types.ts";

export interface FillReceivedPayload {
  clOrdId: string;
  filledQty: number;
  avgFillPrice: number;
  leavesQty: number;
}

// Gateway WebSocket — shared singleton set by gatewayMiddleware
let _gatewayWs: WebSocket | null = null;
export function setGatewayWs(ws: WebSocket | null): void {
  _gatewayWs = ws;
}

/**
 * Submit an order via the gateway WebSocket.
 *
 * The order is added to Redux state immediately with clientOrderId so the
 * blotter shows it at once. The gateway publishes it to the bus; the OMS
 * assigns a canonical orderId and publishes orders.submitted, which the
 * gateway forwards back to the GUI, triggering a patch.
 */
export const submitOrderThunk = createAsyncThunk(
  "orders/submit",
  async (trade: Trade, { dispatch }) => {
    const clientOrderId = uuidv4();
    const order: OrderRecord = {
      id: clientOrderId,
      submittedAt: Date.now(),
      asset: trade.asset,
      side: trade.side,
      quantity: trade.quantity,
      limitPrice: trade.limitPrice,
      expiresAt: Date.now() + trade.expiresAt * 1000,
      strategy: trade.algoParams.strategy,
      status: "queued",
      filled: 0,
      algoParams: trade.algoParams,
      children: [],
    };
    dispatch(ordersSlice.actions.orderAdded(order));

    if (_gatewayWs?.readyState === WebSocket.OPEN) {
      _gatewayWs.send(
        JSON.stringify({
          type: "submitOrder",
          payload: { ...trade, clientOrderId },
        })
      );
    } else {
      console.warn("[orders] Gateway WebSocket not connected — order queued locally only");
    }
  }
);

interface OrdersState {
  orders: OrderRecord[];
}

const initialState: OrdersState = { orders: [] };

export const ordersSlice = createSlice({
  name: "orders",
  initialState,
  reducers: {
    orderAdded(state, action: PayloadAction<OrderRecord>) {
      // Avoid duplicates (hydration vs live event)
      if (!state.orders.find((o) => o.id === action.payload.id)) {
        state.orders.unshift(action.payload);
      }
    },
    orderPatched(state, action: PayloadAction<{ id: string; patch: Partial<OrderRecord> }>) {
      const { id, patch } = action.payload;
      const idx = state.orders.findIndex((o) => o.id === id);
      if (idx !== -1) Object.assign(state.orders[idx], patch);
    },
    childAdded(state, action: PayloadAction<{ parentId: string; child: ChildOrder }>) {
      const { parentId, child } = action.payload;
      const parent = state.orders.find((o) => o.id === parentId);
      if (parent) {
        const exists = parent.children.find((c) => c.id === child.id);
        if (!exists) parent.children.push(child);
        else Object.assign(exists, child);
      }
    },
    limitOrdersChecked(state, action: PayloadAction<MarketPrices>) {
      const prices = action.payload;
      const now = Date.now();
      state.orders = state.orders.map((order) => {
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
      });
    },
    fillReceived(state, action: PayloadAction<FillReceivedPayload>) {
      const { clOrdId, filledQty, leavesQty } = action.payload;
      const order = state.orders.find((o) => o.id === clOrdId);
      if (!order) return;
      order.filled = (order.filled ?? 0) + filledQty;
      if (leavesQty === 0) {
        order.status = "filled";
      } else if (filledQty > 0) {
        order.status = "executing";
      }
    },
  },
});

export const { orderAdded, orderPatched, childAdded, limitOrdersChecked, fillReceived } =
  ordersSlice.actions;

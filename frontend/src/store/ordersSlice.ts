import type { PayloadAction } from "@reduxjs/toolkit";
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { v4 as uuidv4 } from "uuid";
import type { ChildOrder, MarketPrices, OrderRecord, Strategy, Trade } from "../types.ts";

const ENDPOINTS: Record<Strategy, string> = {
  LIMIT: import.meta.env.VITE_LIMIT_URL ?? "http://localhost:5003",
  TWAP: import.meta.env.VITE_TWAP_URL ?? "http://localhost:5004",
  POV: import.meta.env.VITE_POV_URL ?? "http://localhost:5005",
  VWAP: import.meta.env.VITE_VWAP_URL ?? "http://localhost:5006",
};

export const submitOrderThunk = createAsyncThunk(
  "orders/submit",
  async (trade: Trade, { dispatch }) => {
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
    dispatch(ordersSlice.actions.orderAdded(order));
    fetch(ENDPOINTS[strategy], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(trade),
    }).catch(() => {});
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
      state.orders.unshift(action.payload);
    },
    orderPatched(state, action: PayloadAction<{ id: string; patch: Partial<OrderRecord> }>) {
      const { id, patch } = action.payload;
      const idx = state.orders.findIndex((o) => o.id === id);
      if (idx !== -1) Object.assign(state.orders[idx], patch);
    },
    childAdded(state, action: PayloadAction<{ parentId: string; child: ChildOrder }>) {
      const { parentId, child } = action.payload;
      const parent = state.orders.find((o) => o.id === parentId);
      if (parent) parent.children.push(child);
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
  },
});

export const { orderAdded, orderPatched, childAdded, limitOrdersChecked } = ordersSlice.actions;

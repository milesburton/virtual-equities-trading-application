import { describe, expect, it } from "vitest";
import type { ChildOrder, OrderRecord } from "../../types";
import {
  childAdded,
  limitOrdersChecked,
  orderAdded,
  orderPatched,
  ordersSlice,
} from "../ordersSlice";

const { reducer } = ordersSlice;
const initial = { orders: [] };

function makeOrder(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: "order-1",
    submittedAt: 1000,
    asset: "AAPL",
    side: "BUY",
    quantity: 100,
    limitPrice: 150,
    expiresAt: Date.now() + 300_000,
    strategy: "LIMIT",
    status: "queued",
    filled: 0,
    algoParams: { strategy: "LIMIT" },
    children: [],
    ...overrides,
  };
}

describe("ordersSlice – orderAdded", () => {
  it("adds order to empty state", () => {
    const order = makeOrder();
    const state = reducer(initial, orderAdded(order));
    expect(state.orders).toHaveLength(1);
    expect(state.orders[0].id).toBe("order-1");
  });

  it("prepends new orders (newest first)", () => {
    const first = makeOrder({ id: "a" });
    const second = makeOrder({ id: "b" });
    let state = reducer(initial, orderAdded(first));
    state = reducer(state, orderAdded(second));
    expect(state.orders[0].id).toBe("b");
    expect(state.orders[1].id).toBe("a");
  });
});

describe("ordersSlice – orderPatched", () => {
  it("patches a matching order", () => {
    const order = makeOrder({ status: "queued" });
    let state = reducer(initial, orderAdded(order));
    state = reducer(state, orderPatched({ id: "order-1", patch: { status: "executing" } }));
    expect(state.orders[0].status).toBe("executing");
  });

  it("ignores patch for unknown id", () => {
    const order = makeOrder();
    let state = reducer(initial, orderAdded(order));
    state = reducer(state, orderPatched({ id: "unknown-id", patch: { status: "filled" } }));
    expect(state.orders[0].status).toBe("queued");
  });

  it("patches filled quantity", () => {
    const order = makeOrder({ filled: 0, quantity: 100 });
    let state = reducer(initial, orderAdded(order));
    state = reducer(state, orderPatched({ id: "order-1", patch: { filled: 50 } }));
    expect(state.orders[0].filled).toBe(50);
  });
});

describe("ordersSlice – childAdded", () => {
  const child: ChildOrder = {
    id: "child-1",
    parentId: "order-1",
    asset: "AAPL",
    side: "BUY",
    quantity: 25,
    limitPrice: 150,
    status: "filled",
    filled: 25,
    submittedAt: Date.now(),
  };

  it("adds child to parent order", () => {
    const order = makeOrder();
    let state = reducer(initial, orderAdded(order));
    state = reducer(state, childAdded({ parentId: "order-1", child }));
    expect(state.orders[0].children).toHaveLength(1);
    expect(state.orders[0].children[0].id).toBe("child-1");
  });

  it("does nothing for unknown parent", () => {
    const order = makeOrder();
    let state = reducer(initial, orderAdded(order));
    state = reducer(state, childAdded({ parentId: "no-such-order", child }));
    expect(state.orders[0].children).toHaveLength(0);
  });

  it("can add multiple children", () => {
    const order = makeOrder();
    let state = reducer(initial, orderAdded(order));
    state = reducer(state, childAdded({ parentId: "order-1", child: { ...child, id: "c1" } }));
    state = reducer(state, childAdded({ parentId: "order-1", child: { ...child, id: "c2" } }));
    expect(state.orders[0].children).toHaveLength(2);
  });
});

describe("ordersSlice – limitOrdersChecked", () => {
  it("fills a BUY order when market price ≤ limit price", () => {
    const order = makeOrder({ side: "BUY", limitPrice: 155, status: "queued" });
    let state = reducer(initial, orderAdded(order));
    state = reducer(state, limitOrdersChecked({ AAPL: 154 }));
    expect(state.orders[0].status).toBe("filled");
    expect(state.orders[0].filled).toBe(100);
  });

  it("fills a SELL order when market price ≥ limit price", () => {
    const order = makeOrder({ side: "SELL", limitPrice: 150, status: "queued" });
    let state = reducer(initial, orderAdded(order));
    state = reducer(state, limitOrdersChecked({ AAPL: 151 }));
    expect(state.orders[0].status).toBe("filled");
  });

  it("does NOT fill a BUY when market price > limit price", () => {
    const order = makeOrder({ side: "BUY", limitPrice: 150, status: "queued" });
    let state = reducer(initial, orderAdded(order));
    state = reducer(state, limitOrdersChecked({ AAPL: 160 }));
    // queued → executing on first check
    expect(state.orders[0].status).toBe("executing");
  });

  it("transitions queued → executing when not triggered", () => {
    const order = makeOrder({ status: "queued", limitPrice: 100, side: "BUY" });
    let state = reducer(initial, orderAdded(order));
    // price above limit — no fill
    state = reducer(state, limitOrdersChecked({ AAPL: 200 }));
    expect(state.orders[0].status).toBe("executing");
  });

  it("expires order when past expiresAt", () => {
    const expired = makeOrder({ expiresAt: Date.now() - 1000 });
    let state = reducer(initial, orderAdded(expired));
    state = reducer(state, limitOrdersChecked({ AAPL: 999 }));
    expect(state.orders[0].status).toBe("expired");
  });

  it("does not re-check already filled orders", () => {
    const order = makeOrder({ status: "filled", filled: 100 });
    let state = reducer(initial, orderAdded(order));
    state = reducer(state, limitOrdersChecked({ AAPL: 100 }));
    expect(state.orders[0].status).toBe("filled");
  });

  it("does not re-check already expired orders", () => {
    const order = makeOrder({ status: "expired" });
    let state = reducer(initial, orderAdded(order));
    state = reducer(state, limitOrdersChecked({ AAPL: 100 }));
    expect(state.orders[0].status).toBe("expired");
  });

  it("skips non-LIMIT strategy orders", () => {
    const order = makeOrder({ strategy: "TWAP", status: "executing" });
    let state = reducer(initial, orderAdded(order));
    state = reducer(state, limitOrdersChecked({ AAPL: 1 }));
    // Status unchanged — only LIMIT orders are evaluated
    expect(state.orders[0].status).toBe("executing");
  });

  it("skips order when no price for asset", () => {
    const order = makeOrder({ asset: "XYZ", status: "queued" });
    let state = reducer(initial, orderAdded(order));
    state = reducer(state, limitOrdersChecked({ AAPL: 100 })); // no XYZ price
    expect(state.orders[0].status).toBe("queued");
  });
});

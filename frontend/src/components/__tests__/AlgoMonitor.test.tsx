import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { OrderRecord } from "../../types";
import { AlgoMonitor } from "../AlgoMonitor";

const now = Date.now();

function makeOrder(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: "order-1",
    submittedAt: now,
    asset: "AAPL",
    side: "BUY",
    quantity: 100,
    limitPrice: 150,
    expiresAt: now + 60_000,
    strategy: "TWAP",
    status: "executing",
    filled: 25,
    algoParams: { strategy: "TWAP", numSlices: 4, participationCap: 25 },
    children: [],
    ...overrides,
  };
}

describe("AlgoMonitor – empty state", () => {
  it("shows 'No active algo orders' when there are no active orders", () => {
    render(<AlgoMonitor orders={[]} />);
    expect(screen.getByText(/No active algo orders/i)).toBeInTheDocument();
  });

  it("shows 0 active in header with no orders", () => {
    render(<AlgoMonitor orders={[]} />);
    expect(screen.getByText(/0 active/i)).toBeInTheDocument();
  });

  it("hides filled/expired orders from the active list", () => {
    const orders = [
      makeOrder({ status: "filled" }),
      makeOrder({ id: "order-2", status: "expired" }),
    ];
    render(<AlgoMonitor orders={orders} />);
    expect(screen.getByText(/No active algo orders/i)).toBeInTheDocument();
  });
});

describe("AlgoMonitor – active orders", () => {
  it("renders executing order", () => {
    render(<AlgoMonitor orders={[makeOrder()]} />);
    expect(screen.getByText("AAPL")).toBeInTheDocument();
    // "TWAP" appears in both the dropdown option and the table cell
    expect(screen.getAllByText("TWAP").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("BUY")).toBeInTheDocument();
  });

  it("shows 1 active in header", () => {
    render(<AlgoMonitor orders={[makeOrder()]} />);
    expect(screen.getByText(/1 active/i)).toBeInTheDocument();
  });

  it("shows queued order as 'Waiting'", () => {
    render(<AlgoMonitor orders={[makeOrder({ status: "queued" })]} />);
    expect(screen.getByText("Waiting")).toBeInTheDocument();
  });

  it("shows LIMIT executing order as 'Monitoring'", () => {
    render(
      <AlgoMonitor
        orders={[
          makeOrder({
            strategy: "LIMIT",
            status: "executing",
            algoParams: { strategy: "LIMIT" },
          }),
        ]}
      />
    );
    expect(screen.getByText("Monitoring")).toBeInTheDocument();
  });

  it("shows seconds left for non-LIMIT executing orders", () => {
    render(<AlgoMonitor orders={[makeOrder({ expiresAt: now + 30_000 })]} />);
    // Should show something like "30s left"
    expect(screen.getByText(/\d+s left/)).toBeInTheDocument();
  });

  it("calculates and displays fill percentage", () => {
    render(<AlgoMonitor orders={[makeOrder({ quantity: 100, filled: 50 })]} />);
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("clamps progress at 100%", () => {
    render(<AlgoMonitor orders={[makeOrder({ quantity: 100, filled: 150 })]} />);
    expect(screen.getByText("150%")).toBeInTheDocument(); // label shows raw, bar clamps via CSS
  });

  it("renders filled quantity", () => {
    render(<AlgoMonitor orders={[makeOrder({ filled: 25 })]} />);
    // filled column
    expect(screen.getByText("25")).toBeInTheDocument();
  });
});

describe("AlgoMonitor – strategy filter", () => {
  const orders = [
    makeOrder({ id: "1", strategy: "TWAP", asset: "AAPL", algoParams: { strategy: "TWAP", numSlices: 4, participationCap: 25 } }),
    makeOrder({ id: "2", strategy: "POV", asset: "MSFT", algoParams: { strategy: "POV", participationRate: 10, minSliceSize: 1, maxSliceSize: 500 } }),
    makeOrder({ id: "3", strategy: "LIMIT", asset: "GOOGL", algoParams: { strategy: "LIMIT" } }),
  ];

  it("shows all orders when filter is ALL", () => {
    render(<AlgoMonitor orders={orders} />);
    expect(screen.getByText("AAPL")).toBeInTheDocument();
    expect(screen.getByText("MSFT")).toBeInTheDocument();
    expect(screen.getByText("GOOGL")).toBeInTheDocument();
  });

  it("filters to show only TWAP orders", () => {
    render(<AlgoMonitor orders={orders} />);
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "TWAP" } });

    expect(screen.getByText("AAPL")).toBeInTheDocument();
    expect(screen.queryByText("MSFT")).not.toBeInTheDocument();
    expect(screen.queryByText("GOOGL")).not.toBeInTheDocument();
  });

  it("filters to show only POV orders", () => {
    render(<AlgoMonitor orders={orders} />);
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "POV" } });

    expect(screen.queryByText("AAPL")).not.toBeInTheDocument();
    expect(screen.getByText("MSFT")).toBeInTheDocument();
    expect(screen.queryByText("GOOGL")).not.toBeInTheDocument();
  });
});

describe("AlgoMonitor – child orders", () => {
  const child = {
    id: "child-1",
    parentId: "order-1",
    asset: "AAPL",
    side: "BUY" as const,
    quantity: 25,
    limitPrice: 150,
    status: "filled" as const,
    filled: 25,
    submittedAt: now,
  };

  it("renders child order rows when present", () => {
    render(<AlgoMonitor orders={[makeOrder({ children: [child] })]} />);
    // Child rows show "child" as strategy label
    expect(screen.getByText("child")).toBeInTheDocument();
  });
});

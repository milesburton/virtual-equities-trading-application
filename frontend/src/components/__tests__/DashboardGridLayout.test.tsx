/**
 * Regression tests for react-grid-layout configuration.
 *
 * These tests guard against two bugs that caused panels to jump/reflow
 * whenever Redux state changed (e.g. clicking an asset in MarketLadder):
 *
 *  1. The grid was using the default "vertical" compactor, which re-compacted
 *     the whole layout on every render, pulling panels upward unexpectedly.
 *     Fix: pass `compactor={noCompactor}` to GridLayout.
 *
 *  2. CSS transforms were enabled (default), meaning the library positioned
 *     items with `transform: translate()`. Our CSS transition rules only
 *     targeted `left/top/width/height`, so the transform updates animated
 *     visibly on every state change.
 *     Fix: pass `useCSSTransforms={false}` to GridLayout.
 */

import { configureStore } from "@reduxjs/toolkit";
import { render } from "@testing-library/react";
import { noCompactor } from "react-grid-layout";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";

// ── Mock react-grid-layout so we can inspect the props it receives ────────────

vi.mock("react-grid-layout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-grid-layout")>();
  return {
    ...actual,
    default: vi.fn(({ children }: { children?: React.ReactNode }) => (
      <div data-testid="mock-grid-layout">{children}</div>
    )),
  };
});

// ── Mock all panel components to avoid deep dependency trees in tests ─────────

vi.mock("../MarketLadder", () => ({ MarketLadder: () => <div /> }));
vi.mock("../OrderTicket", () => ({ OrderTicket: () => <div /> }));
vi.mock("../OrderBlotter", () => ({ OrderBlotter: () => <div /> }));
vi.mock("../AlgoMonitor", () => ({ AlgoMonitor: () => <div /> }));
vi.mock("../ObservabilityPanel", () => ({ ObservabilityPanel: () => <div /> }));
vi.mock("../CandlestickChart", () => ({ CandlestickChart: () => <div /> }));
vi.mock("../MarketDepth", () => ({ MarketDepth: () => <div /> }));

// ── Import DashboardLayout AFTER mocks are set up ─────────────────────────────

import GridLayoutLib from "react-grid-layout";
import { channelsSlice } from "../../store/channelsSlice";
import { marketSlice } from "../../store/marketSlice";
import { uiSlice } from "../../store/uiSlice";
import { windowSlice } from "../../store/windowSlice";
import { DashboardLayout, DashboardProvider } from "../DashboardLayout";

const MockGridLayout = GridLayoutLib as unknown as ReturnType<typeof vi.fn>;

function makeStore() {
  return configureStore({
    reducer: {
      market: marketSlice.reducer,
      ui: uiSlice.reducer,
      windows: windowSlice.reducer,
      channels: channelsSlice.reducer,
    },
    preloadedState: {
      market: {
        assets: [],
        prices: {},
        priceHistory: {},
        candleHistory: {},
        connected: false,
        orderBook: {},
      },
    },
  });
}

function renderDashboard() {
  MockGridLayout.mockClear();
  const store = makeStore();
  render(
    <Provider store={store}>
      <DashboardProvider>
        <DashboardLayout />
      </DashboardProvider>
    </Provider>
  );
  return MockGridLayout.mock.calls.at(-1)?.[0] as Record<string, unknown>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DashboardLayout – grid compaction (regression: panels jumping on click)", () => {
  it("passes noCompactor to GridLayout to disable automatic vertical compaction", () => {
    const props = renderDashboard();
    expect(props).toBeDefined();
    expect(props.compactor).toBe(noCompactor);
  });

  it("noCompactor.compact returns the layout unchanged (no reordering)", () => {
    const layout = [
      { i: "order-ticket", x: 0, y: 5, w: 2, h: 12 },
      { i: "market-ladder", x: 2, y: 0, w: 3, h: 12 },
    ];
    const result = noCompactor.compact(layout as never, 12);
    // Items must not be moved — y:5 stays y:5, y:0 stays y:0
    expect(result[0].y).toBe(5);
    expect(result[1].y).toBe(0);
  });
});

describe("DashboardLayout – CSS transforms (regression: transform animation on state change)", () => {
  it("passes useCSSTransforms={false} to GridLayout", () => {
    const props = renderDashboard();
    expect(props).toBeDefined();
    expect(props.useCSSTransforms).toBe(false);
  });
});

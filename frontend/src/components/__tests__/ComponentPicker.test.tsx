import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { Model } from "flexlayout-react";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";
import { authSlice } from "../../store/authSlice";
import { ComponentPicker } from "../ComponentPicker";
import type { PanelId } from "../DashboardLayout";
import { DashboardContext, DEFAULT_LAYOUT } from "../DashboardLayout";

function makeStore() {
  return configureStore({ reducer: { auth: authSlice.reducer } });
}

// ─── Helper: render ComponentPicker with a custom context value ───────────────

function renderPicker(overrides?: {
  activePanelIds?: Set<PanelId>;
  addPanel?: (id: PanelId) => void;
  removePanel?: (id: PanelId) => void;
  resetLayout?: () => void;
}) {
  const defaultActive = new Set(DEFAULT_LAYOUT.map((l) => l.i as PanelId));
  const addPanel = overrides?.addPanel ?? vi.fn();
  const removePanel = overrides?.removePanel ?? vi.fn();
  const resetLayout = overrides?.resetLayout ?? vi.fn();
  const activePanelIds = overrides?.activePanelIds ?? defaultActive;

  const utils = render(
    <Provider store={makeStore()}>
      <DashboardContext.Provider
        value={{
          layout: DEFAULT_LAYOUT,
          setLayout: vi.fn(),
          activePanelIds,
          addPanel,
          removePanel,
          resetLayout,
          storageKey: "dashboard-layout",
          model: Model.fromJson({ global: {}, layout: { type: "row", children: [] } }),
          setModel: vi.fn(),
        }}
      >
        <ComponentPicker />
      </DashboardContext.Provider>
    </Provider>
  );
  return { ...utils, addPanel, removePanel, resetLayout };
}

function openDropdown() {
  fireEvent.click(screen.getByRole("button", { name: /add panel/i }));
}

// Helper: find a picker button whose label starts with the given prefix
function getPickerBtn(prefix: string) {
  return screen.getByText(new RegExp(`^${prefix}`)).closest("button");
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ComponentPicker – toggle open/closed", () => {
  it("renders an Add Panel button", () => {
    renderPicker();
    expect(screen.getByRole("button", { name: /add panel/i })).toBeInTheDocument();
  });

  it("does not show the dropdown before clicking", () => {
    renderPicker();
    expect(screen.queryByText(/^Market Ladder/)).not.toBeInTheDocument();
  });

  it("shows the panel list after clicking the Panels button", () => {
    renderPicker();
    openDropdown();
    expect(screen.getByText(/^Market Ladder/)).toBeInTheDocument();
  });

  it("shows all available panel names", () => {
    renderPicker();
    openDropdown();
    expect(screen.getByText(/^Market Ladder/)).toBeInTheDocument();
    expect(screen.getByText(/^Order Ticket/)).toBeInTheDocument();
    expect(screen.getByText(/^Order Blotter/)).toBeInTheDocument();
    expect(screen.getByText(/^Algo Monitor/)).toBeInTheDocument();
    expect(screen.getByText(/^Observability/)).toBeInTheDocument();
    expect(screen.getByText(/^Price Chart/)).toBeInTheDocument();
    expect(screen.getByText(/^Market Depth/)).toBeInTheDocument();
  });

  it("closes dropdown when clicking the backdrop", () => {
    renderPicker();
    openDropdown();
    expect(screen.getByText(/^Market Ladder/)).toBeInTheDocument();
    // The backdrop button has aria-label "Close panel picker"
    fireEvent.click(screen.getByLabelText("Close panel picker"));
    expect(screen.queryByText(/^Market Ladder/)).not.toBeInTheDocument();
  });

  it("does not show a reset layout button inside the dropdown", () => {
    renderPicker();
    openDropdown();
    expect(screen.queryByText(/reset to default layout/i)).not.toBeInTheDocument();
  });
});

describe("ComponentPicker – active/hidden state", () => {
  it("disables singleton panels that are already open", () => {
    // order-ticket is a singleton; if it is already open the button should be disabled
    renderPicker({ activePanelIds: new Set(["order-ticket"]) });
    openDropdown();
    const btn = getPickerBtn("Order Ticket");
    expect(btn).toBeDisabled();
  });

  it("enables singleton panels that are not yet open", () => {
    renderPicker({ activePanelIds: new Set([]) });
    openDropdown();
    const btn = getPickerBtn("Order Ticket");
    expect(btn).not.toBeDisabled();
  });

  it("always enables non-singleton panels regardless of open state", () => {
    // market-ladder is not a singleton — can have multiple instances
    renderPicker({ activePanelIds: new Set(["market-ladder"]) });
    openDropdown();
    const btn = getPickerBtn("Market Ladder");
    expect(btn).not.toBeDisabled();
  });
});

describe("ComponentPicker – add panels", () => {
  it("calls addPanel when clicking an enabled panel", () => {
    const addPanel = vi.fn();
    renderPicker({ activePanelIds: new Set([]), addPanel });
    openDropdown();
    const btn = getPickerBtn("Market Ladder");
    if (btn) fireEvent.click(btn);
    expect(addPanel).toHaveBeenCalledWith("market-ladder");
  });

  it("closes the dropdown after adding a panel", () => {
    renderPicker({ activePanelIds: new Set([]) });
    openDropdown();
    expect(screen.getByText(/^Market Ladder/)).toBeInTheDocument();
    const btn = getPickerBtn("Market Ladder");
    if (btn) fireEvent.click(btn);
    expect(screen.queryByText(/^Market Ladder/)).not.toBeInTheDocument();
  });

  it("does not call addPanel when clicking a disabled singleton button", () => {
    const addPanel = vi.fn();
    renderPicker({ activePanelIds: new Set(["order-ticket"]), addPanel });
    openDropdown();
    const btn = getPickerBtn("Order Ticket");
    if (btn) fireEvent.click(btn);
    expect(addPanel).not.toHaveBeenCalled();
  });
});

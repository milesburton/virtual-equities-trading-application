import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
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
          activePanelIds,
          addPanel,
          removePanel,
          resetLayout,
          storageKey: "dashboard-layout",
        }}
      >
        <ComponentPicker />
      </DashboardContext.Provider>
    </Provider>
  );
  return { ...utils, addPanel, removePanel, resetLayout };
}

function openDropdown() {
  fireEvent.click(screen.getByRole("button", { name: /panels/i }));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ComponentPicker – toggle open/closed", () => {
  it("renders a Panels button", () => {
    renderPicker();
    expect(screen.getByRole("button", { name: /panels/i })).toBeInTheDocument();
  });

  it("does not show the dropdown before clicking", () => {
    renderPicker();
    expect(screen.queryByText("Market Ladder")).not.toBeInTheDocument();
  });

  it("shows the panel list after clicking the Panels button", () => {
    renderPicker();
    openDropdown();
    expect(screen.getByText("Market Ladder")).toBeInTheDocument();
  });

  it("shows all available panel names", () => {
    renderPicker();
    openDropdown();
    expect(screen.getByText("Market Ladder")).toBeInTheDocument();
    expect(screen.getByText("Order Ticket")).toBeInTheDocument();
    expect(screen.getByText("Order Blotter")).toBeInTheDocument();
    expect(screen.getByText("Algo Monitor")).toBeInTheDocument();
    expect(screen.getByText("Observability")).toBeInTheDocument();
    expect(screen.getByText("Chart")).toBeInTheDocument();
    expect(screen.getByText("Market Depth")).toBeInTheDocument();
  });

  it("closes dropdown when clicking the backdrop", () => {
    renderPicker();
    openDropdown();
    expect(screen.getByText("Market Ladder")).toBeInTheDocument();
    // The backdrop button has aria-label "Close panel picker"
    fireEvent.click(screen.getByLabelText("Close panel picker"));
    expect(screen.queryByText("Market Ladder")).not.toBeInTheDocument();
  });

  it("does not show a reset layout button inside the dropdown", () => {
    renderPicker();
    openDropdown();
    expect(screen.queryByText(/reset to default layout/i)).not.toBeInTheDocument();
  });
});

describe("ComponentPicker – active/hidden state", () => {
  it("shows 'visible' badge for active panels", () => {
    renderPicker({ activePanelIds: new Set(["market-ladder"]) });
    openDropdown();
    // Find the badge next to Market Ladder
    const row = screen.getByText("Market Ladder").closest("li");
    expect(row?.textContent).toContain("visible");
  });

  it("shows 'hidden' badge for inactive panels", () => {
    renderPicker({ activePanelIds: new Set(["market-ladder"]) });
    openDropdown();
    const row = screen.getByText("Order Ticket").closest("li");
    expect(row?.textContent).toContain("hidden");
  });
});

describe("ComponentPicker – add / remove panels", () => {
  it("calls addPanel when clicking a hidden panel", () => {
    const addPanel = vi.fn();
    renderPicker({ activePanelIds: new Set([]), addPanel });
    openDropdown();
    const btn = screen.getByText("Market Ladder").closest("button");
    if (btn) fireEvent.click(btn);
    expect(addPanel).toHaveBeenCalledWith("market-ladder");
  });

  it("calls removePanel when clicking an active panel", () => {
    const removePanel = vi.fn();
    renderPicker({ activePanelIds: new Set(["market-ladder"]), removePanel });
    openDropdown();
    const btn = screen.getByText("Market Ladder").closest("button");
    if (btn) fireEvent.click(btn);
    expect(removePanel).toHaveBeenCalledWith("market-ladder");
  });
});

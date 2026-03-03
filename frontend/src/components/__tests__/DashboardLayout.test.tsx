import { act, fireEvent, render, screen } from "@testing-library/react";
import { useContext } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PanelId } from "../DashboardLayout";
import {
  DashboardContext,
  DashboardProvider,
  DEFAULT_LAYOUT,
  PANEL_IDS,
  PANEL_TITLES,
  STORAGE_KEY,
  useDashboard,
} from "../DashboardLayout";

// ─── LocalStorage helpers ────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  localStorage.clear();
});

// ─── Consumer component for testing context values ────────────────────────────

function ContextInspector() {
  const { activePanelIds, addPanel, removePanel, resetLayout } = useDashboard();
  return (
    <div>
      <span data-testid="active-count">{activePanelIds.size}</span>
      <span data-testid="active-ids">{[...activePanelIds].join(",")}</span>
      <button type="button" onClick={() => addPanel("candle-chart")}>
        Add Chart
      </button>
      <button type="button" onClick={() => removePanel("order-blotter")}>
        Remove Blotter
      </button>
      <button type="button" onClick={() => resetLayout()}>
        Reset
      </button>
    </div>
  );
}

function renderProvider(children = <ContextInspector />) {
  return render(<DashboardProvider>{children}</DashboardProvider>);
}

// ─── DashboardProvider – initial state ───────────────────────────────────────

describe("DashboardProvider – initial state", () => {
  it("provides activePanelIds from DEFAULT_LAYOUT when localStorage is empty", () => {
    renderProvider();
    const defaultIds = DEFAULT_LAYOUT.map((l) => l.i)
      .sort()
      .join(",");
    const activeIds = screen.getByTestId("active-ids").textContent?.split(",").sort().join(",");
    expect(activeIds).toBe(defaultIds);
  });

  it("loads layout from localStorage if present and versioned", () => {
    const custom = [
      { i: "candle-chart", panelType: "candle-chart", x: 0, y: 0, w: 6, h: 6 },
      { i: "market-depth", panelType: "market-depth", x: 6, y: 0, w: 6, h: 6 },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ _v: 3, items: custom }));
    renderProvider();
    const activeIds = screen.getByTestId("active-ids").textContent;
    expect(activeIds).toContain("candle-chart");
    expect(activeIds).toContain("market-depth");
  });

  it("falls back to DEFAULT_LAYOUT when localStorage contains an old unversioned plain array", () => {
    const oldLayout = [{ i: "candle-chart", x: 0, y: 0, w: 6, h: 6 }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(oldLayout));
    renderProvider();
    const count = Number(screen.getByTestId("active-count").textContent);
    expect(count).toBe(DEFAULT_LAYOUT.length);
  });

  it("falls back to DEFAULT_LAYOUT when localStorage contains invalid JSON", () => {
    localStorage.setItem(STORAGE_KEY, "not-valid-json{{");
    renderProvider();
    const count = Number(screen.getByTestId("active-count").textContent);
    expect(count).toBe(DEFAULT_LAYOUT.length);
  });
});

// ─── DashboardProvider – addPanel ─────────────────────────────────────────────

describe("DashboardProvider – addPanel", () => {
  it("adds a panel that was not in the active set", () => {
    const withoutChart = DEFAULT_LAYOUT.filter((l) => l.i !== "candle-chart");
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ _v: 3, items: withoutChart }));
    renderProvider();
    const before = Number(screen.getByTestId("active-count").textContent);
    act(() => {
      fireEvent.click(screen.getByText("Add Chart"));
    });
    const after = Number(screen.getByTestId("active-count").textContent);
    expect(after).toBe(before + 1);
    expect(screen.getByTestId("active-ids").textContent).toContain("candle-chart");
  });

  it("does not duplicate a panel already in the layout", () => {
    // candle-chart is already in DEFAULT_LAYOUT; clicking Add Chart should be a no-op
    renderProvider();
    const before = Number(screen.getByTestId("active-count").textContent);
    act(() => {
      fireEvent.click(screen.getByText("Add Chart"));
    });
    expect(Number(screen.getByTestId("active-count").textContent)).toBe(before);
  });

  it("persists the updated layout to localStorage", () => {
    const withoutChart = DEFAULT_LAYOUT.filter((l) => l.i !== "candle-chart");
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ _v: 3, items: withoutChart }));
    renderProvider();
    act(() => {
      fireEvent.click(screen.getByText("Add Chart"));
    });
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(
      stored.items.some(
        (l: { panelType?: string; i: string }) => (l.panelType ?? l.i) === "candle-chart"
      )
    ).toBe(true);
  });
});

// ─── DashboardProvider – removePanel ─────────────────────────────────────────

describe("DashboardProvider – removePanel", () => {
  it("removes a panel from the active set", () => {
    renderProvider();
    const before = Number(screen.getByTestId("active-count").textContent);
    act(() => {
      fireEvent.click(screen.getByText("Remove Blotter"));
    });
    const after = Number(screen.getByTestId("active-count").textContent);
    expect(after).toBe(before - 1);
    expect(screen.getByTestId("active-ids").textContent).not.toContain("order-blotter");
  });

  it("persists the updated layout to localStorage", () => {
    renderProvider();
    act(() => {
      fireEvent.click(screen.getByText("Remove Blotter"));
    });
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(stored.items.every((l: { i: string }) => l.i !== "order-blotter")).toBe(true);
  });
});

// ─── DashboardProvider – resetLayout ─────────────────────────────────────────

describe("DashboardProvider – resetLayout", () => {
  it("restores the DEFAULT_LAYOUT panel set", () => {
    const custom = [{ i: "candle-chart", panelType: "candle-chart", x: 0, y: 0, w: 6, h: 6 }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ _v: 3, items: custom }));
    renderProvider();

    act(() => {
      fireEvent.click(screen.getByText("Reset"));
    });

    const defaultIds = DEFAULT_LAYOUT.map((l) => l.i)
      .sort()
      .join(",");
    const activeIds = screen.getByTestId("active-ids").textContent?.split(",").sort().join(",");
    expect(activeIds).toBe(defaultIds);
  });

  it("writes DEFAULT_LAYOUT to localStorage in versioned format", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        _v: 3,
        items: [{ i: "candle-chart", panelType: "candle-chart", x: 0, y: 0, w: 4, h: 4 }],
      })
    );
    renderProvider();

    act(() => {
      fireEvent.click(screen.getByText("Reset"));
    });

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    expect(stored._v).toBe(3);
    expect(stored.items).toEqual(DEFAULT_LAYOUT);
  });
});

// ─── PANEL_IDS and PANEL_TITLES integrity ─────────────────────────────────────

describe("Panel registry", () => {
  it("every PANEL_ID has a title in PANEL_TITLES", () => {
    for (const id of PANEL_IDS) {
      expect(PANEL_TITLES[id]).toBeTruthy();
    }
  });

  it("DEFAULT_LAYOUT panelTypes are all valid PANEL_IDs", () => {
    for (const item of DEFAULT_LAYOUT) {
      expect(PANEL_IDS).toContain(item.panelType as PanelId);
    }
  });
});

// ─── Default context values (no provider) ────────────────────────────────────

describe("DashboardContext – default value", () => {
  it("provides empty activePanelIds without a provider", () => {
    function Check() {
      const ctx = useContext(DashboardContext);
      return <span data-testid="size">{ctx.activePanelIds.size}</span>;
    }
    render(<Check />);
    expect(screen.getByTestId("size").textContent).toBe("0");
  });
});

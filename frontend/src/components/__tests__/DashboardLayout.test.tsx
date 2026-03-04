import { act, fireEvent, render, screen } from "@testing-library/react";
import type { IJsonModel } from "flexlayout-react";
import { Model } from "flexlayout-react";
import { useContext } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PanelId } from "../DashboardLayout";
import {
  DashboardContext,
  DashboardProvider,
  DEFAULT_LAYOUT,
  modelToLayoutItems,
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

const LAYOUT_VERSION = 4;

/** Serialize a flexlayout Model into the format used by saveFlexModel */
function storeModel(model: Model, key = STORAGE_KEY) {
  localStorage.setItem(key, JSON.stringify({ _v: LAYOUT_VERSION, flex: model.toJson() }));
}

/** Build a minimal flexlayout JSON model with the given panel types */
function makeMinimalModel(panelTypes: PanelId[]): IJsonModel {
  return {
    global: {},
    layout: {
      type: "row",
      children: panelTypes.map((pt) => ({
        type: "tabset",
        weight: Math.floor(100 / panelTypes.length),
        children: [
          {
            type: "tab",
            id: pt,
            name: PANEL_TITLES[pt] ?? pt,
            component: pt,
            config: { panelType: pt },
          },
        ],
      })),
    },
  };
}

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
    const defaultIds = DEFAULT_LAYOUT.map((l) => l.panelType)
      .sort()
      .join(",");
    const activeIds = screen.getByTestId("active-ids").textContent?.split(",").sort().join(",");
    expect(activeIds).toBe(defaultIds);
  });

  it("loads layout from localStorage if present and versioned (v4)", () => {
    const model = Model.fromJson(makeMinimalModel(["candle-chart", "market-depth"]));
    storeModel(model);
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

  it("falls back to DEFAULT_LAYOUT when stored version does not match", () => {
    // v3 format (old react-grid-layout)
    const oldV3 = {
      _v: 3,
      items: [{ i: "candle-chart", panelType: "candle-chart", x: 0, y: 0, w: 6, h: 6 }],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(oldV3));
    renderProvider();
    const count = Number(screen.getByTestId("active-count").textContent);
    expect(count).toBe(DEFAULT_LAYOUT.length);
  });
});

// ─── DashboardProvider – addPanel ─────────────────────────────────────────────

describe("DashboardProvider – addPanel", () => {
  it("adds a panel that was not in the active set", () => {
    // Start without candle-chart
    const model = Model.fromJson(makeMinimalModel(["market-ladder", "order-ticket"]));
    storeModel(model);
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
    renderProvider();
    const before = Number(screen.getByTestId("active-count").textContent);
    act(() => {
      fireEvent.click(screen.getByText("Add Chart"));
    });
    expect(Number(screen.getByTestId("active-count").textContent)).toBe(before);
  });

  it("persists the updated layout to localStorage", () => {
    const model = Model.fromJson(makeMinimalModel(["market-ladder", "order-ticket"]));
    storeModel(model);
    renderProvider();
    act(() => {
      fireEvent.click(screen.getByText("Add Chart"));
    });
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(stored._v).toBe(LAYOUT_VERSION);
    const savedModel = Model.fromJson(stored.flex as IJsonModel);
    const items = modelToLayoutItems(savedModel);
    expect(items.some((l) => l.panelType === "candle-chart")).toBe(true);
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
    expect(stored._v).toBe(LAYOUT_VERSION);
    const savedModel = Model.fromJson(stored.flex as IJsonModel);
    const items = modelToLayoutItems(savedModel);
    expect(items.every((l) => l.panelType !== "order-blotter")).toBe(true);
  });
});

// ─── DashboardProvider – resetLayout ─────────────────────────────────────────

describe("DashboardProvider – resetLayout", () => {
  it("restores the DEFAULT_LAYOUT panel set", () => {
    const model = Model.fromJson(makeMinimalModel(["candle-chart"]));
    storeModel(model);
    renderProvider();

    act(() => {
      fireEvent.click(screen.getByText("Reset"));
    });

    const defaultIds = DEFAULT_LAYOUT.map((l) => l.panelType)
      .sort()
      .join(",");
    const activeIds = screen.getByTestId("active-ids").textContent?.split(",").sort().join(",");
    expect(activeIds).toBe(defaultIds);
  });

  it("writes layout to localStorage in v4 flexlayout format", () => {
    renderProvider();

    act(() => {
      fireEvent.click(screen.getByText("Reset"));
    });

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    expect(stored._v).toBe(LAYOUT_VERSION);
    expect(stored.flex).toBeDefined();
    expect(stored.flex.layout).toBeDefined();
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

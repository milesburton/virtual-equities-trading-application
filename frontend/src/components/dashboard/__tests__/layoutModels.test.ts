import { Model } from "flexlayout-react";
import { describe, expect, it } from "vitest";
import {
  LAYOUT_TEMPLATES,
  makeAdminModel,
  makeAlgoModel,
  makeAnalysisModel,
  makeClearModel,
  makeDefaultModel,
  makeExecutionModel,
  STORAGE_KEY,
  STORAGE_KEY_PREFIX,
} from "../layoutModels.ts";

function countTabs(model: ReturnType<typeof makeDefaultModel>): number {
  let count = 0;
  const m = Model.fromJson(model);
  m.visitNodes((node) => {
    if (node.getType() === "tab") count++;
  });
  return count;
}

describe("STORAGE_KEY", () => {
  it("STORAGE_KEY equals STORAGE_KEY_PREFIX", () => {
    expect(STORAGE_KEY).toBe(STORAGE_KEY_PREFIX);
  });

  it("is a non-empty string", () => {
    expect(typeof STORAGE_KEY).toBe("string");
    expect(STORAGE_KEY.length).toBeGreaterThan(0);
  });
});

describe("makeDefaultModel", () => {
  it("produces a valid flexlayout JSON model", () => {
    const json = makeDefaultModel();
    expect(json.layout.type).toBe("row");
    expect(json.global).toBeDefined();
  });

  it("includes at least 8 tabs", () => {
    expect(countTabs(makeDefaultModel())).toBeGreaterThanOrEqual(8);
  });

  it("includes market-ladder panel", () => {
    let found = false;
    Model.fromJson(makeDefaultModel()).visitNodes((node) => {
      if (node.getType() === "tab" && node.getId() === "market-ladder") found = true;
    });
    expect(found).toBe(true);
  });

  it("does not include admin panel (mission control layout is separate)", () => {
    let found = false;
    Model.fromJson(makeDefaultModel()).visitNodes((node) => {
      if (node.getType() === "tab" && node.getId() === "admin") found = true;
    });
    expect(found).toBe(false);
  });
});

describe("makeExecutionModel", () => {
  it("contains order-ticket, market-ladder, order-blotter", () => {
    const ids = new Set<string>();
    Model.fromJson(makeExecutionModel()).visitNodes((node) => {
      if (node.getType() === "tab") ids.add(node.getId());
    });
    expect(ids.has("order-ticket")).toBe(true);
    expect(ids.has("market-ladder")).toBe(true);
    expect(ids.has("order-blotter")).toBe(true);
  });
});

describe("makeAlgoModel", () => {
  it("contains candle-chart and algo-monitor", () => {
    const ids = new Set<string>();
    Model.fromJson(makeAlgoModel()).visitNodes((node) => {
      if (node.getType() === "tab") ids.add(node.getId());
    });
    expect(ids.has("candle-chart")).toBe(true);
    expect(ids.has("algo-monitor")).toBe(true);
  });
});

describe("makeAnalysisModel", () => {
  it("contains market-ladder, candle-chart, and news", () => {
    const ids = new Set<string>();
    Model.fromJson(makeAnalysisModel()).visitNodes((node) => {
      if (node.getType() === "tab") ids.add(node.getId());
    });
    expect(ids.has("market-ladder")).toBe(true);
    expect(ids.has("candle-chart")).toBe(true);
    expect(ids.has("news")).toBe(true);
  });

  it("does not include order-ticket", () => {
    const ids = new Set<string>();
    Model.fromJson(makeAnalysisModel()).visitNodes((node) => {
      if (node.getType() === "tab") ids.add(node.getId());
    });
    expect(ids.has("order-ticket")).toBe(false);
  });
});

describe("makeClearModel", () => {
  it("produces a model with zero tabs", () => {
    expect(countTabs(makeClearModel())).toBe(0);
  });

  it("has a single tabset child in the layout row", () => {
    const json = makeClearModel();
    expect(json.layout.children).toHaveLength(1);
    expect(json.layout.children[0].type).toBe("tabset");
  });
});

describe("makeAdminModel", () => {
  it("includes admin panel", () => {
    const ids = new Set<string>();
    Model.fromJson(makeAdminModel()).visitNodes((node) => {
      if (node.getType() === "tab") ids.add(node.getId());
    });
    expect(ids.has("admin")).toBe(true);
  });

  it("does not include order-ticket (admins cannot trade)", () => {
    const ids = new Set<string>();
    Model.fromJson(makeAdminModel()).visitNodes((node) => {
      if (node.getType() === "tab") ids.add(node.getId());
    });
    expect(ids.has("order-ticket")).toBe(false);
  });
});

describe("LAYOUT_TEMPLATES", () => {
  it("has 6 templates", () => {
    expect(LAYOUT_TEMPLATES).toHaveLength(6);
  });

  it("every template has id, label, description, and a valid model", () => {
    for (const tpl of LAYOUT_TEMPLATES) {
      expect(tpl.id).toBeTruthy();
      expect(tpl.label).toBeTruthy();
      expect(tpl.description).toBeTruthy();
      expect(() => Model.fromJson(tpl.model)).not.toThrow();
    }
  });

  it("template ids are unique", () => {
    const ids = LAYOUT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes a 'clear' template with zero tabs", () => {
    const clearTpl = LAYOUT_TEMPLATES.find((t) => t.id === "clear");
    expect(clearTpl).toBeDefined();
    expect(countTabs(clearTpl!.model)).toBe(0);
  });
});

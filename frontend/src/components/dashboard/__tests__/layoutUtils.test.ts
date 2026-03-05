import { Model } from "flexlayout-react";
import { describe, expect, it } from "vitest";
import type { ChannelNumber } from "../../../store/channelsSlice.ts";
import { makeDefaultModel } from "../layoutModels.ts";
import type { LayoutItem } from "../layoutUtils.ts";
import {
  DEFAULT_LAYOUT,
  modelToLayoutItems,
  wouldCreateCycleIn,
  wouldCreateCycleOut,
} from "../layoutUtils.ts";

// Helpers

function item(id: string, outgoing?: ChannelNumber, incoming?: ChannelNumber): LayoutItem {
  return { i: id, panelType: "market-ladder", x: 0, y: 0, w: 4, h: 6, outgoing, incoming };
}

describe("DEFAULT_LAYOUT", () => {
  it("is a non-empty array", () => {
    expect(DEFAULT_LAYOUT.length).toBeGreaterThan(0);
  });

  it("all items have a valid panelType", () => {
    for (const item of DEFAULT_LAYOUT) {
      expect(item.panelType).toBeTruthy();
    }
  });

  it("all items have an instance id (i)", () => {
    for (const it of DEFAULT_LAYOUT) {
      expect(it.i).toBeTruthy();
    }
  });
});

describe("modelToLayoutItems", () => {
  it("returns one item per tab in the model", () => {
    const model = Model.fromJson(makeDefaultModel());
    const items = modelToLayoutItems(model);
    let tabCount = 0;
    model.visitNodes((n) => {
      if (n.getType() === "tab") tabCount++;
    });
    expect(items).toHaveLength(tabCount);
  });

  it("preserves channel assignments", () => {
    const items = DEFAULT_LAYOUT;
    const ladder = items.find((i) => i.panelType === "market-ladder");
    expect(ladder?.outgoing).toBe(1);
  });
});

describe("wouldCreateCycleOut", () => {
  it("returns false when panel has no incoming channel", () => {
    const items = [item("a", 1, undefined), item("b", undefined, 1)];
    // "a" has no incoming, so assigning outgoing=2 cannot cycle
    expect(wouldCreateCycleOut(2, "a", items)).toBe(false);
  });

  it("returns true when assigning outgoing would route back to this panel", () => {
    // a → ch1 → b → ch2 → a (cycle)
    const items = [
      item("a", 1, 2), // a broadcasts on 1, receives on 2
      item("b", 2, 1), // b broadcasts on 2, receives on 1
    ];
    expect(wouldCreateCycleOut(1, "b", items)).toBe(true);
  });

  it("returns false when there is no cycle", () => {
    const items = [
      item("a", 1, undefined), // broadcasts on 1
      item("b", undefined, 1), // receives on 1
    ];
    expect(wouldCreateCycleOut(2, "a", items)).toBe(false);
  });
});

describe("wouldCreateCycleIn", () => {
  it("returns false when panel has no outgoing channel", () => {
    const items = [item("a", undefined, 1)];
    expect(wouldCreateCycleIn(2, "a", items)).toBe(false);
  });

  it("returns true when incoming equals existing outgoing", () => {
    const items = [item("a", 1, undefined)];
    // Panel "a" already broadcasts on ch1 — setting incoming=1 creates direct cycle
    expect(wouldCreateCycleIn(1, "a", items)).toBe(true);
  });

  it("returns true for an indirect cycle", () => {
    // a(out=1) → b(in=1, out=2) → if we set a's incoming=2 → cycle
    const items = [item("a", 1, undefined), item("b", 2, 1)];
    expect(wouldCreateCycleIn(2, "a", items)).toBe(true);
  });

  it("returns false when no cycle exists", () => {
    const items = [item("a", 1, undefined), item("b", undefined, 1)];
    expect(wouldCreateCycleIn(3, "a", items)).toBe(false);
  });
});

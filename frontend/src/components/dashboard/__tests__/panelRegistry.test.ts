import { describe, expect, it } from "vitest";
import {
  CHANNEL_COLOURS,
  PANEL_CHANNEL_CAPS,
  PANEL_DESCRIPTIONS,
  PANEL_IDS,
  PANEL_TITLES,
  SINGLETON_PANELS,
} from "../panelRegistry.ts";

describe("PANEL_IDS completeness", () => {
  it("contains at least 15 panels", () => {
    expect(PANEL_IDS.length).toBeGreaterThanOrEqual(15);
  });

  it("every PANEL_ID has a title", () => {
    for (const id of PANEL_IDS) {
      expect(PANEL_TITLES[id], `title missing for ${id}`).toBeTruthy();
    }
  });

  it("every PANEL_ID has a description", () => {
    for (const id of PANEL_IDS) {
      expect(PANEL_DESCRIPTIONS[id], `description missing for ${id}`).toBeTruthy();
    }
  });

  it("every PANEL_ID has channel caps", () => {
    for (const id of PANEL_IDS) {
      const caps = PANEL_CHANNEL_CAPS[id];
      expect(caps, `caps missing for ${id}`).toBeDefined();
      expect(typeof caps.out).toBe("boolean");
      expect(typeof caps.in).toBe("boolean");
    }
  });
});

describe("SINGLETON_PANELS", () => {
  it("all singleton IDs are valid PANEL_IDs", () => {
    for (const id of SINGLETON_PANELS) {
      expect(PANEL_IDS).toContain(id);
    }
  });

  it("includes order-ticket, order-blotter, admin", () => {
    expect(SINGLETON_PANELS.has("order-ticket")).toBe(true);
    expect(SINGLETON_PANELS.has("order-blotter")).toBe(true);
    expect(SINGLETON_PANELS.has("admin")).toBe(true);
  });
});

describe("CHANNEL_COLOURS", () => {
  const CHANNEL_NUMBERS = [1, 2, 3, 4, 5, 6] as const;

  it("defines all 6 channels", () => {
    for (const n of CHANNEL_NUMBERS) {
      expect(CHANNEL_COLOURS[n]).toBeDefined();
    }
  });

  it("each channel has hex, tw, and label", () => {
    for (const n of CHANNEL_NUMBERS) {
      const col = CHANNEL_COLOURS[n];
      expect(col.hex).toMatch(/^#[0-9a-f]{6}$/i);
      expect(col.tw).toBeTruthy();
      expect(col.label).toBeTruthy();
    }
  });

  it("channel hex colours are unique", () => {
    const hexes = CHANNEL_NUMBERS.map((n) => CHANNEL_COLOURS[n].hex);
    expect(new Set(hexes).size).toBe(CHANNEL_NUMBERS.length);
  });
});

describe("PANEL_CHANNEL_CAPS logic", () => {
  it("market-ladder can only broadcast (out: true, in: false)", () => {
    expect(PANEL_CHANNEL_CAPS["market-ladder"].out).toBe(true);
    expect(PANEL_CHANNEL_CAPS["market-ladder"].in).toBe(false);
  });

  it("order-ticket can only receive (out: false, in: true)", () => {
    expect(PANEL_CHANNEL_CAPS["order-ticket"].out).toBe(false);
    expect(PANEL_CHANNEL_CAPS["order-ticket"].in).toBe(true);
  });

  it("admin cannot broadcast or receive", () => {
    expect(PANEL_CHANNEL_CAPS.admin.out).toBe(false);
    expect(PANEL_CHANNEL_CAPS.admin.in).toBe(false);
  });

  it("market-heatmap can broadcast but not receive", () => {
    expect(PANEL_CHANNEL_CAPS["market-heatmap"].out).toBe(true);
    expect(PANEL_CHANNEL_CAPS["market-heatmap"].in).toBe(false);
  });
});

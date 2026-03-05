/**
 * MarketLadderPage — selectors and actions for the Market Ladder panel.
 *
 * Scoped to a Locator (its flexlayout tab container) so it never
 * accidentally match content in other panels.
 */

import type { Locator } from "@playwright/test";
import { expect } from "@playwright/test";

export class MarketLadderPage {
  constructor(private readonly root: Locator) {}

  /** All asset rows in the ladder. */
  rows() {
    return this.root.getByRole("listitem");
  }

  /** The row for a specific symbol. */
  rowForSymbol(symbol: string) {
    return this.root.getByRole("listitem").filter({ hasText: symbol }).first();
  }

  /** Wait until a row for the given symbol is visible. */
  async waitForSymbol(symbol: string) {
    await expect(this.rowForSymbol(symbol)).toBeVisible({ timeout: 8_000 });
  }

  /** Click a symbol row to select it. */
  async selectSymbol(symbol: string) {
    await this.rowForSymbol(symbol).click();
  }

  /**
   * Get the displayed last-price text for a symbol.
   * Returns the text content of the price cell.
   */
  async getPriceText(symbol: string): Promise<string> {
    const row = this.rowForSymbol(symbol);
    // The price is in a span with tabular-nums inside the row
    // (the Last/price column is the 4th numeric cell)
    const priceCell = row.locator(".tabular-nums").nth(2);
    return (await priceCell.textContent()) ?? "";
  }

  /**
   * Returns "up", "down", or "neutral" based on the text colour class
   * applied to the price flash span after a tick.
   */
  async getPriceColour(symbol: string): Promise<"up" | "down" | "neutral"> {
    const row = this.rowForSymbol(symbol);
    const priceSpan = row.locator(".tabular-nums").nth(2);
    const cls = await priceSpan.getAttribute("class") ?? "";
    if (cls.includes("emerald")) return "up";
    if (cls.includes("red")) return "down";
    return "neutral";
  }

  /** Assert the symbol row has positive width and height (is visible and laid out). */
  async expectVisible(symbol: string) {
    const row = this.rowForSymbol(symbol);
    await expect(row).toBeVisible({ timeout: 8_000 });
    const bb = await row.boundingBox();
    expect(bb?.width).toBeGreaterThan(0);
    expect(bb?.height).toBeGreaterThan(0);
  }

  /** Assert the change-percent badge is green (positive) for the given symbol. */
  async expectPositiveChange(symbol: string) {
    const row = this.rowForSymbol(symbol);
    const changeBadge = row.locator(".text-emerald-400").last();
    await expect(changeBadge).toBeVisible({ timeout: 5_000 });
  }

  /** Assert the change-percent badge is red (negative) for the given symbol. */
  async expectNegativeChange(symbol: string) {
    const row = this.rowForSymbol(symbol);
    const changeBadge = row.locator(".text-red-400").last();
    await expect(changeBadge).toBeVisible({ timeout: 5_000 });
  }
}

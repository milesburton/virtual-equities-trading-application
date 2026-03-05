/**
 * OrderBlotterPage — selectors and assertions for the Order Blotter panel.
 */

import type { Locator } from "@playwright/test";
import { expect } from "@playwright/test";

export type OrderStatus = "queued" | "executing" | "filled" | "expired" | "rejected";

export class OrderBlotterPage {
  constructor(private readonly root: Locator) {}

  private get table() { return this.root.locator("table"); }

  /** All order rows (parent rows only, not child execution rows). */
  orderRows() {
    // Parent rows have aria-selected attribute; child rows use tr.bg-gray-900/40
    return this.table.locator("tbody tr[aria-selected]");
  }

  /** Find an order row by its client order ID prefix (first 8 chars). */
  rowByIdPrefix(prefix: string) {
    return this.table.locator("tbody tr[aria-selected]").filter({ hasText: prefix });
  }

  /**
   * Wait until at least one order row with the given status badge appears.
   * Useful after submitting an order to confirm it arrived in the blotter.
   */
  async waitForStatus(status: OrderStatus, timeoutMs = 8_000) {
    await expect(
      this.root.locator(`span:has-text("${status}")`)
    ).toBeVisible({ timeout: timeoutMs });
  }

  /**
   * Return the status text of the most recently added order row.
   */
  async latestOrderStatus(): Promise<string> {
    const rows = this.orderRows();
    const count = await rows.count();
    if (count === 0) throw new Error("No order rows in blotter");
    const lastRow = rows.last();
    const badge = lastRow.locator("span.uppercase").first();
    return (await badge.textContent())?.toLowerCase().trim() ?? "";
  }

  /**
   * Return the status of a specific order row (by ID prefix).
   */
  async statusOf(idPrefix: string): Promise<string> {
    const row = this.rowByIdPrefix(idPrefix);
    const badge = row.locator("span.uppercase").first();
    return (await badge.textContent())?.toLowerCase().trim() ?? "";
  }

  /** Assert the blotter shows at least one order. */
  async expectHasOrders() {
    await expect(this.orderRows().first()).toBeVisible({ timeout: 8_000 });
  }

  /** Assert there are no orders yet (empty state message). */
  async expectEmpty() {
    await expect(this.root.getByText(/No orders submitted yet/i)).toBeVisible({ timeout: 5_000 });
  }

  /** Assert the most recent order has the given status. */
  async expectLatestStatus(status: OrderStatus) {
    // Poll until the status matches — WS events may arrive slightly after
    await expect(async () => {
      const s = await this.latestOrderStatus();
      expect(s).toBe(status);
    }).toPass({ timeout: 8_000 });
  }

  /** Assert that the blotter contains a row with the given asset name. */
  async expectAssetVisible(asset: string) {
    await expect(
      this.table.locator("tbody td").filter({ hasText: asset }).first()
    ).toBeVisible({ timeout: 6_000 });
  }
}

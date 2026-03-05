/**
 * OrderTicketPage — selectors and actions for the Order Ticket panel.
 */

import type { Locator } from "@playwright/test";
import { expect } from "@playwright/test";

export type Side = "BUY" | "SELL";
export type Strategy = "LIMIT" | "TWAP" | "POV" | "VWAP";

export interface OrderParams {
  asset?: string;
  side?: Side;
  quantity?: number;
  limitPrice?: number;
  strategy?: Strategy;
}

export class OrderTicketPage {
  constructor(private readonly root: Locator) {}

  private get form() { return this.root.locator("form").first(); }
  private get strategySelect() { return this.root.getByLabel("Execution strategy"); }
  private get quantityInput() { return this.root.getByLabel("Order quantity in shares"); }
  private get limitPriceInput() { return this.root.getByLabel(/Limit Price/i); }
  private get buyButton() { return this.root.getByRole("button", { name: /^BUY$/i }); }
  private get sellButton() { return this.root.getByRole("button", { name: /^SELL$/i }); }
  private get submitButton() { return this.root.getByRole("button", { name: /submit|place order/i }); }

  /** Fill and submit an order. Only overrides the fields you specify. */
  async fillOrder({ asset, side = "BUY", quantity, limitPrice, strategy = "LIMIT" }: OrderParams) {
    // Strategy
    await this.strategySelect.selectOption(strategy);

    // Side
    if (side === "BUY") await this.buyButton.click();
    else await this.sellButton.click();

    // Quantity
    if (quantity !== undefined) {
      await this.quantityInput.fill(String(quantity));
    }

    // Limit price
    if (limitPrice !== undefined) {
      await this.limitPriceInput.fill(String(limitPrice));
    }

    // Asset — type into the asset search input
    if (asset !== undefined) {
      const assetInput = this.root.locator("input[placeholder], input[type='text']").first();
      await assetInput.fill(asset);
      // Wait for the suggestion and click it if a dropdown appears
      const option = this.root.getByRole("option", { name: asset }).first();
      const hasOption = await option.isVisible().catch(() => false);
      if (hasOption) await option.click();
    }
  }

  /** Click the submit button. */
  async submit() {
    await this.submitButton.click();
  }

  /** Fill the form and immediately submit. */
  async placeOrder(params: OrderParams) {
    await this.fillOrder(params);
    await this.submit();
  }

  /** Assert the submit button is enabled. */
  async expectSubmitEnabled() {
    await expect(this.submitButton).toBeEnabled({ timeout: 5_000 });
  }

  /** Assert the submit button is disabled (e.g. limit violation or admin role). */
  async expectSubmitDisabled() {
    await expect(this.submitButton).toBeDisabled({ timeout: 5_000 });
  }

  /** Assert a limit warning message is visible. */
  async expectLimitWarning(textFragment: string | RegExp) {
    await expect(this.root.getByText(textFragment)).toBeVisible({ timeout: 5_000 });
  }

  /** Assert success feedback is shown after submission. */
  async expectSuccessFeedback() {
    await expect(this.root.getByText(/Order submitted/i)).toBeVisible({ timeout: 6_000 });
  }

  /** Assert the admin-cannot-trade notice is shown. */
  async expectAdminNotice() {
    await expect(this.root.getByText(/Admin account/i)).toBeVisible({ timeout: 5_000 });
  }
}

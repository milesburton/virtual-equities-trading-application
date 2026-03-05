/**
 * AppPage — top-level page object.
 *
 * Orchestrates navigation, authentication, and access to panel page objects.
 * All panel objects are scoped to their flexlayout tab container so selectors
 * never accidentally match content in adjacent panels.
 */

import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { GatewayMock, DEFAULT_ADMIN, DEFAULT_TRADER } from "../GatewayMock.ts";
import type { AuthUser, AssetDef } from "../GatewayMock.ts";
import { MarketLadderPage } from "./MarketLadderPage.ts";
import { OrderTicketPage } from "./OrderTicketPage.ts";
import { OrderBlotterPage } from "./OrderBlotterPage.ts";

export class AppPage {
  readonly page: Page;
  gateway!: GatewayMock;

  constructor(page: Page) {
    this.page = page;
  }

  // ── Setup ──────────────────────────────────────────────────────────────────

  /**
   * Full test setup: attach gateway mock, navigate, wait for dashboard.
   * Returns `this` for chaining.
   */
  async goto(opts: { user?: AuthUser; assets?: AssetDef[] } = {}): Promise<this> {
    this.gateway = await GatewayMock.attach(this.page, opts);
    await this.page.goto("/");
    return this;
  }

  /** Navigate as a trader and wait for the dashboard to render. */
  async gotoAsTrader(assets?: AssetDef[]): Promise<this> {
    await this.goto({ user: DEFAULT_TRADER, assets });
    await this.waitForDashboard();
    this.gateway.sendAuthIdentity({ user: DEFAULT_TRADER });
    return this;
  }

  /** Navigate as an admin and wait for the dashboard to render. */
  async gotoAsAdmin(): Promise<this> {
    await this.goto({ user: DEFAULT_ADMIN });
    await this.waitForDashboard();
    this.gateway.sendAuthIdentity({ user: DEFAULT_ADMIN });
    return this;
  }

  // ── Waits ──────────────────────────────────────────────────────────────────

  /** Wait until at least one flexlayout tab panel is visible. */
  async waitForDashboard() {
    await this.page.waitForSelector(".flexlayout__tab", { timeout: 15_000 });
  }

  /** Wait for the login page to be shown (unauthenticated state). */
  async waitForLoginPage() {
    await expect(this.page.getByRole("heading", { name: /select your profile/i })).toBeVisible({
      timeout: 8_000,
    });
  }

  // ── Panel accessors ────────────────────────────────────────────────────────

  /**
   * Find the flexlayout tab content pane for a given tab button title.
   *
   * flexlayout puts tab buttons (.flexlayout__tab_button[data-layout-path])
   * and content panes (.flexlayout__tab[data-layout-path]) in separate DOM
   * subtrees. They share the same path prefix but use different suffixes:
   *   button: /r1/ts0/tb0  →  content: /r1/ts0/t0
   *
   * This async method resolves the path at call time, then returns a stable
   * locator scoped to the matched content pane.
   */
  private async panelByTitle(tabTitle: string | RegExp): Promise<ReturnType<Page["locator"]>> {
    const btn = this.page.locator(".flexlayout__tab_button", { hasText: tabTitle }).first();
    const btnPath = await btn.getAttribute("data-layout-path");
    if (!btnPath) throw new Error(`No tab button found with title matching ${tabTitle}`);
    // Convert button path to content path: replace last tb<n> with t<n>
    const contentPath = btnPath.replace(/tb(\d+)$/, "t$1");
    return this.page.locator(`.flexlayout__tab[data-layout-path="${contentPath}"]`);
  }

  async getMarketLadder(): Promise<MarketLadderPage> {
    return new MarketLadderPage(await this.panelByTitle(/Market Ladder/i));
  }

  async getOrderTicket(): Promise<OrderTicketPage> {
    // Order Ticket tab dynamically shows the selected symbol: "AAPL(place trades)"
    // Match by the invariant bracket suffix rather than the panel type label.
    return new OrderTicketPage(await this.panelByTitle(/\(place trades\)/i));
  }

  async getOrderBlotter(): Promise<OrderBlotterPage> {
    return new OrderBlotterPage(await this.panelByTitle(/Orders.*active/i));
  }

  // ── Auth state assertions ──────────────────────────────────────────────────

  /** Assert the user avatar/name chip is visible in the header. */
  async expectUserVisible(name: string) {
    await expect(this.page.getByText(name, { exact: false })).toBeVisible({ timeout: 5_000 });
  }

  /** Assert the login page is shown. */
  async expectLoginPage() {
    await this.waitForLoginPage();
  }
}

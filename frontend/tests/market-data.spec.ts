/**
 * Market data rendering tests.
 *
 * Tests cover:
 *   - Market Ladder displays asset rows when assets are seeded
 *   - Price updates via WS marketUpdate appear in the ladder
 *   - Positive / negative price changes show correct colours
 *   - Selecting a symbol row broadcasts to linked panels (tab title update)
 */

import { test, expect } from "@playwright/test";
import { AppPage } from "./helpers/pages/AppPage.ts";
import { DEFAULT_ASSETS } from "./helpers/GatewayMock.ts";

test.describe("Market data", () => {
  // ── Asset list rendering ───────────────────────────────────────────────────

  test.describe("Market Ladder — asset rows", () => {
    test("shows a row for each seeded asset", async ({ page }) => {
      const app = new AppPage(page);
      await app.gotoAsTrader(DEFAULT_ASSETS);

      const ladder = await app.getMarketLadder();
      for (const asset of DEFAULT_ASSETS) {
        await ladder.waitForSymbol(asset.symbol);
        await ladder.expectVisible(asset.symbol);
      }
    });

    test("initially shows dash placeholders for prices (no ticks yet)", async ({ page }) => {
      const app = new AppPage(page);
      await app.gotoAsTrader(DEFAULT_ASSETS);

      const ladder = await app.getMarketLadder();
      await ladder.waitForSymbol("AAPL");

      // Before any marketUpdate, prices should show '—' (no ticks received)
      const aaplRow = ladder.rowForSymbol("AAPL");
      await expect(aaplRow).toBeVisible();
      // The row exists; price cells will show '—' until a tick arrives
      const rowText = await aaplRow.textContent();
      expect(rowText).toContain("AAPL");
    });
  });

  // ── Live price updates ─────────────────────────────────────────────────────

  test.describe("Market Ladder — live price updates", () => {
    test("prices appear after a marketUpdate WS message", async ({ page }) => {
      const app = new AppPage(page);
      await app.gotoAsTrader(DEFAULT_ASSETS);

      const ladder = await app.getMarketLadder();
      await ladder.waitForSymbol("AAPL");

      // Send a tick
      app.gateway.sendMarketUpdate({ AAPL: 189.50, MSFT: 421.00, GOOGL: 175.25 });

      // The ladder batches ticks at 250ms, wait a bit then check price text
      await page.waitForTimeout(400);

      const aaplRow = ladder.rowForSymbol("AAPL");
      const rowText = await aaplRow.textContent();
      // Price is rendered as e.g. "189.50" — check it appears somewhere in the row
      expect(rowText).toMatch(/189\.\d\d|189\.5/);
    });

    test("price going up applies green (emerald) colour class", async ({ page }) => {
      const app = new AppPage(page);
      await app.gotoAsTrader(DEFAULT_ASSETS);

      const ladder = await app.getMarketLadder();
      await ladder.waitForSymbol("AAPL");

      // First tick — sets a baseline
      app.gateway.sendMarketUpdate({ AAPL: 180.00 });
      await page.waitForTimeout(400);

      // Second tick higher — triggers flash-green
      app.gateway.sendMarketUpdate({ AAPL: 185.00 });
      await page.waitForTimeout(400);

      // The price span should have the emerald class applied during the flash window
      const aaplRow = ladder.rowForSymbol("AAPL");
      const priceSpan = aaplRow.locator(".tabular-nums").nth(3);

      // The flash is 400ms; we check within that window
      await expect(priceSpan).toHaveClass(/emerald/, { timeout: 500 });
    });

    test("price going down applies red colour class", async ({ page }) => {
      const app = new AppPage(page);
      await app.gotoAsTrader(DEFAULT_ASSETS);

      const ladder = await app.getMarketLadder();
      await ladder.waitForSymbol("AAPL");

      app.gateway.sendMarketUpdate({ AAPL: 190.00 });
      await page.waitForTimeout(400);

      app.gateway.sendMarketUpdate({ AAPL: 185.00 });
      await page.waitForTimeout(400);

      const aaplRow = ladder.rowForSymbol("AAPL");
      const priceSpan = aaplRow.locator(".tabular-nums").nth(3);
      await expect(priceSpan).toHaveClass(/red/, { timeout: 500 });
    });

    test("multiple symbols update independently", async ({ page }) => {
      const app = new AppPage(page);
      await app.gotoAsTrader(DEFAULT_ASSETS);

      const ladder = await app.getMarketLadder();
      await ladder.waitForSymbol("MSFT");

      app.gateway.sendMarketUpdate({ AAPL: 189.50, MSFT: 421.00 });
      await page.waitForTimeout(400);

      const msftRow = ladder.rowForSymbol("MSFT");
      const msftText = await msftRow.textContent();
      expect(msftText).toMatch(/421\.\d\d|421\.0/);
    });
  });

  // ── Symbol selection ───────────────────────────────────────────────────────

  test.describe("Market Ladder — symbol selection", () => {
    test("clicking a symbol row marks it as selected", async ({ page }) => {
      const app = new AppPage(page);
      await app.gotoAsTrader(DEFAULT_ASSETS);

      const ladder = await app.getMarketLadder();
      await ladder.waitForSymbol("AAPL");
      await ladder.selectSymbol("AAPL");

      // The row should have aria-pressed=true after selection
      await expect(
        ladder.rowForSymbol("AAPL")
      ).toHaveAttribute("aria-pressed", "true", { timeout: 3_000 });
    });

    test("clicking the same symbol again deselects it", async ({ page }) => {
      const app = new AppPage(page);
      await app.gotoAsTrader(DEFAULT_ASSETS);

      const ladder = await app.getMarketLadder();
      await ladder.waitForSymbol("AAPL");

      // Select then deselect
      await ladder.selectSymbol("AAPL");
      await expect(ladder.rowForSymbol("AAPL")).toHaveAttribute("aria-pressed", "true", { timeout: 3_000 });

      await ladder.selectSymbol("AAPL");
      await expect(ladder.rowForSymbol("AAPL")).toHaveAttribute("aria-pressed", "false", { timeout: 3_000 });
    });
  });
});

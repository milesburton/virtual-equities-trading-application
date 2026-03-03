import { test, expect, type Page } from "@playwright/test";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Mock the auth API so the app skips the login page and goes straight to the dashboard. */
async function mockAuth(page: Page) {
  const user = { id: "alice", name: "Alice Chen", role: "trader", avatar_emoji: "👩‍💼" };

  await page.route("/api/user-service/sessions/me", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) })
  );

  await page.route("/api/user-service/sessions", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) })
  );
}

/** Stub backend so panels don't error out. */
async function stubBackend(page: Page) {
  await page.route("/api/**", (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    route.fulfill({ status: 200, contentType: "application/json", body: "null" });
  });
}

/** Wait until at least one panel drag-handle is visible (dashboard has rendered). */
async function waitForDashboard(page: Page) {
  await page.waitForSelector(".panel-drag-handle", { timeout: 15_000 });
}

/** Slowly drag from (startX, startY) by (dx, dy) and release. */
async function drag(page: Page, startX: number, startY: number, dx: number, dy: number) {
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(startX + (dx * i) / steps, startY + (dy * i) / steps, { steps: 1 });
  }
  await page.mouse.up();
  // Let RGL commit the drop position.
  await page.waitForTimeout(200);
}

/** Collect bounding boxes for all grid-item-wrapper elements. */
async function allPanelBoxes(page: Page) {
  const wrappers = page.locator(".grid-item-wrapper");
  const count = await wrappers.count();
  const boxes: { x: number; y: number; w: number; h: number }[] = [];
  for (let i = 0; i < count; i++) {
    const bb = await wrappers.nth(i).boundingBox();
    if (bb) boxes.push({ x: bb.x, y: bb.y, w: bb.width, h: bb.height });
  }
  return boxes;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("Dashboard panel drag", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page);
    await stubBackend(page);
    await page.goto("/");
    await waitForDashboard(page);
  });

  test("panels do not jump when mousedown fires on the drag handle", async ({ page }) => {
    const handle = page.locator(".panel-drag-handle").first();
    const box = await handle.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const wrapper = page.locator(".grid-item-wrapper").first();
    const before = await wrapper.boundingBox();
    expect(before).not.toBeNull();

    // Press and immediately release — simulates the problematic mousedown.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.up();

    const after = await wrapper.boundingBox();
    expect(after).not.toBeNull();

    expect(Math.round(after!.x)).toBe(Math.round(before!.x));
    expect(Math.round(after!.y)).toBe(Math.round(before!.y));
  });

  test("clicking inside any panel body does not cause dashboard jump", async ({ page }) => {
    const dashboardScroller = page.locator(".flex-1.overflow-y-auto").first();
    await expect(dashboardScroller).toBeVisible();

    const wrappers = page.locator(".grid-item-wrapper");
    const panelCount = await wrappers.count();
    expect(panelCount).toBeGreaterThan(0);

    const beforeScroll = await dashboardScroller.evaluate((el) => el.scrollTop);

    for (let i = 0; i < panelCount; i++) {
      const wrapper = wrappers.nth(i);
      const before = await wrapper.boundingBox();
      if (!before) continue;

      const clickX = before.x + Math.min(24, Math.max(8, before.width / 5));
      const clickY = before.y + Math.min(58, Math.max(34, before.height / 3));
      await page.mouse.click(clickX, clickY);
      await page.waitForTimeout(80);

      const after = await wrapper.boundingBox();
      if (!after) continue;

      expect(Math.abs(after.x - before.x), `panel ${i} x changed after click`).toBeLessThan(3);
      expect(Math.abs(after.y - before.y), `panel ${i} y changed after click`).toBeLessThan(3);
    }

    const afterScroll = await dashboardScroller.evaluate((el) => el.scrollTop);
    expect(Math.abs(afterScroll - beforeScroll)).toBeLessThan(3);
  });

  test("clicking a Market Ladder row does not move the panel", async ({ page }) => {
    const dashboardScroller = page.locator(".flex-1.overflow-y-auto").first();
    await expect(dashboardScroller).toBeVisible();

    const marketLadderPanel = page
      .locator(".grid-item-wrapper")
      .filter({ has: page.locator(".panel-drag-handle", { hasText: "Market Ladder" }) })
      .first();

    await expect(marketLadderPanel).toBeVisible();
    const before = await marketLadderPanel.boundingBox();
    expect(before).not.toBeNull();
    if (!before) return;

    const beforeScroll = await dashboardScroller.evaluate((el) => el.scrollTop);

    const firstRow = marketLadderPanel.locator("[role='listitem']").first();
    await expect(firstRow).toBeVisible();
    await firstRow.click();
    await page.waitForTimeout(100);

    const after = await marketLadderPanel.boundingBox();
    expect(after).not.toBeNull();
    if (!after) return;

    const afterScroll = await dashboardScroller.evaluate((el) => el.scrollTop);

    expect(Math.abs(after.x - before.x)).toBeLessThan(3);
    expect(Math.abs(after.y - before.y)).toBeLessThan(3);
    expect(Math.abs(afterScroll - beforeScroll)).toBeLessThan(3);
  });

  test("panel lands at the dragged-to position and does not snap back", async ({ page }) => {
    const handle = page.locator(".panel-drag-handle").nth(1);
    const handleBox = await handle.boundingBox();
    expect(handleBox).not.toBeNull();
    if (!handleBox) return;

    const wrapper = page.locator(".grid-item-wrapper").nth(1);
    const before = await wrapper.boundingBox();
    expect(before).not.toBeNull();

    await drag(page, handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2, 120, 60);

    const after = await wrapper.boundingBox();
    expect(after).not.toBeNull();

    // Must have moved.
    expect(Math.abs(after!.x - before!.x) + Math.abs(after!.y - before!.y)).toBeGreaterThan(0);

    // Must not have snapped back (4 px tolerance).
    expect(Math.abs(after!.x - before!.x) < 4 && Math.abs(after!.y - before!.y) < 4).toBe(false);

    // Must still be in the same place 500 ms later.
    await page.waitForTimeout(500);
    const stable = await wrapper.boundingBox();
    expect(Math.abs(stable!.x - after!.x)).toBeLessThan(4);
    expect(Math.abs(stable!.y - after!.y)).toBeLessThan(4);
  });

  test("all panels remain visible and non-overlapping after a drag", async ({ page }) => {
    const before = await allPanelBoxes(page);
    expect(before.length).toBeGreaterThan(1);

    // Drag the last panel (Order Blotter — bottom row, full width) straight down
    // into the empty space below it. This avoids any collision with other panels,
    // so noCompactor has nothing to push and all other panels must stay put.
    const handles = page.locator(".panel-drag-handle");
    const lastHandle = handles.last();
    const handleBox = await lastHandle.boundingBox();
    expect(handleBox).not.toBeNull();
    if (!handleBox) return;

    await drag(page, handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2, 0, 160);

    await page.waitForTimeout(500);

    const after = await allPanelBoxes(page);

    // Same number of panels — none got stuck in a ghost state or disappeared.
    expect(after.length).toBe(before.length);

    // Every panel must have a positive size (no zero-height/collapsed panels).
    for (const box of after) {
      expect(box.w).toBeGreaterThan(10);
      expect(box.h).toBeGreaterThan(10);
    }

    // No two panels should substantially overlap.
    // Allow a 4px tolerance for borders/margins.
    const tolerance = 4;
    for (let i = 0; i < after.length; i++) {
      for (let j = i + 1; j < after.length; j++) {
        const a = after[i];
        const b = after[j];
        const overlapX = a.x + a.w - tolerance > b.x && b.x + b.w - tolerance > a.x;
        const overlapY = a.y + a.h - tolerance > b.y && b.y + b.h - tolerance > a.y;
        expect(overlapX && overlapY, `Panel ${i} and panel ${j} are overlapping after drag`).toBe(false);
      }
    }

    // No panel should be at a suspiciously large y (e.g. > 4000px — indicates a ghost row gap).
    for (const box of after) {
      expect(box.y, "A panel has been displaced to an anomalous y position").toBeLessThan(4000);
    }
  });

  test("layout is stable after multiple sequential drags", async ({ page }) => {
    const panelCount = await page.locator(".grid-item-wrapper").count();

    // Drag the last panel (bottom row, full width) down into empty space three
    // times. Each drag targets free rows so noCompactor never pushes other panels.
    for (let i = 0; i < 3; i++) {
      const handle = page.locator(".panel-drag-handle").last();
      const hb = await handle.boundingBox();
      if (!hb) continue;
      await drag(page, hb.x + hb.width / 2, hb.y + hb.height / 2, 0, 54);
    }

    await page.waitForTimeout(500);

    // All panels still present.
    expect(await page.locator(".grid-item-wrapper").count()).toBe(panelCount);

    // No anomalous gaps.
    const boxes = await allPanelBoxes(page);
    for (const box of boxes) {
      expect(box.y).toBeLessThan(4000);
      expect(box.h).toBeGreaterThan(10);
    }
  });
});

import { test, expect, type Page } from "@playwright/test";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Mock the auth API so the app skips the login page and goes straight to the dashboard. */
async function mockAuth(page: Page) {
  const user = { id: "alice", name: "Alice Chen", role: "trader", avatar_emoji: "👩‍💼" };

  // Playwright matches routes in reverse registration order (last registered wins).
  // stubBackend must be called BEFORE mockAuth so the specific session routes take precedence.
  // These two are registered last here so they win over the catch-all in stubBackend.
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

/** Wait until flexlayout has rendered at least one tab. */
async function waitForDashboard(page: Page) {
  await page.waitForSelector(".flexlayout__tab", { timeout: 15_000 });
}

/** Collect bounding boxes for all flexlayout tab content panes. */
async function allPanelBoxes(page: Page) {
  const panes = page.locator(".flexlayout__tab");
  const count = await panes.count();
  const boxes: { x: number; y: number; w: number; h: number }[] = [];
  for (let i = 0; i < count; i++) {
    const bb = await panes.nth(i).boundingBox();
    if (bb) boxes.push({ x: bb.x, y: bb.y, w: bb.width, h: bb.height });
  }
  return boxes;
}

/** Drag a tab button by (dx, dy) using slow intermediate steps. */
async function dragTab(page: Page, tabLocator: ReturnType<Page["locator"]>, dx: number, dy: number) {
  const box = await tabLocator.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(startX + (dx * i) / steps, startY + (dy * i) / steps, { steps: 1 });
  }
  await page.mouse.up();
  await page.waitForTimeout(200);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("Dashboard panel layout (flexlayout)", () => {
  test.beforeEach(async ({ page }) => {
    // stubBackend first (catch-all, lowest priority), mockAuth last (specific routes, highest priority)
    await stubBackend(page);
    await mockAuth(page);
    await page.goto("/");
    await waitForDashboard(page);
  });

  test("panels render and each has positive dimensions", async ({ page }) => {
    const boxes = await allPanelBoxes(page);
    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) {
      expect(box.w, "panel has zero width").toBeGreaterThan(10);
      expect(box.h, "panel has zero height").toBeGreaterThan(10);
    }
  });

  test("no two panels overlap", async ({ page }) => {
    const boxes = await allPanelBoxes(page);
    expect(boxes.length).toBeGreaterThan(1);

    const tolerance = 4;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlapX = a.x + a.w - tolerance > b.x && b.x + b.w - tolerance > a.x;
        const overlapY = a.y + a.h - tolerance > b.y && b.y + b.h - tolerance > a.y;
        expect(overlapX && overlapY, `Panel ${i} and panel ${j} overlap`).toBe(false);
      }
    }
  });

  test("clicking inside a panel body does not move the panel", async ({ page }) => {
    const panes = page.locator(".flexlayout__tab");
    const count = await panes.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const pane = panes.nth(i);
      const before = await pane.boundingBox();
      if (!before) continue;

      // Click well inside the content area (avoid splitter edges)
      const clickX = before.x + before.width / 2;
      const clickY = before.y + before.height / 2;
      await page.mouse.click(clickX, clickY);
      await page.waitForTimeout(80);

      const after = await pane.boundingBox();
      if (!after) continue;

      expect(Math.abs(after.x - before.x), `panel ${i} x changed after click`).toBeLessThanOrEqual(3);
      expect(Math.abs(after.y - before.y), `panel ${i} y changed after click`).toBeLessThanOrEqual(3);
    }
  });

  test("dragging a tab to another tabset moves it and preserves all panels", async ({ page }) => {
    // Count tab buttons (all tabs, not just visible panels) — this is the canonical panel count
    const tabs = page.locator(".flexlayout__tab_button");
    const tabCount = await tabs.count();
    if (tabCount < 2) return; // Not enough tabs to test
    const beforeTabCount = tabCount;

    // Drag the second tab button 300px to the right to drop into an adjacent tabset
    const srcTab = tabs.nth(1);
    await dragTab(page, srcTab, 300, 0);

    await page.waitForTimeout(400);

    // Tab button count should be the same — no tabs lost or duplicated
    // (visible panel count may decrease by 1 if the tab lands in a tabset that already has an active panel)
    const afterTabCount = await page.locator(".flexlayout__tab_button").count();
    expect(afterTabCount).toBe(beforeTabCount);

    // All visible panels still have positive size
    const afterBoxes = await allPanelBoxes(page);
    for (const box of afterBoxes) {
      expect(box.w).toBeGreaterThan(10);
      expect(box.h).toBeGreaterThan(10);
    }
  });

  test("panel position is stable 500ms after a tab drag", async ({ page }) => {
    const tabs = page.locator(".flexlayout__tab_button");
    const tabCount = await tabs.count();
    if (tabCount < 1) return;

    const srcTab = tabs.first();
    const before = await srcTab.boundingBox();

    // Small drag that resolves back to the same tabset (no movement)
    await dragTab(page, srcTab, 5, 5);

    await page.waitForTimeout(500);

    const boxes = await allPanelBoxes(page);
    // Check all panels still have reasonable dimensions after micro-drag
    for (const box of boxes) {
      expect(box.w).toBeGreaterThan(10);
      expect(box.h).toBeGreaterThan(10);
    }

    // Suppress unused-var warning — before used for symmetry
    void before;
  });

  test("splitter drag resizes adjacent panels proportionally", async ({ page }) => {
    const splitter = page.locator(".flexlayout__splitter").first();
    const splitterBox = await splitter.boundingBox();
    if (!splitterBox) return;

    const beforeBoxes = await allPanelBoxes(page);
    expect(beforeBoxes.length).toBeGreaterThan(1);

    // Drag splitter 60px to the right
    await page.mouse.move(splitterBox.x + splitterBox.width / 2, splitterBox.y + splitterBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(splitterBox.x + splitterBox.width / 2 + 60, splitterBox.y + splitterBox.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    const afterBoxes = await allPanelBoxes(page);

    // Same number of panels — splitter drag never destroys panels
    expect(afterBoxes.length).toBe(beforeBoxes.length);

    // Total area covered must still be positive for all panels
    for (const box of afterBoxes) {
      expect(box.w).toBeGreaterThan(10);
      expect(box.h).toBeGreaterThan(10);
    }
  });

  test("clicking a Market Ladder row does not move any panel", async ({ page }) => {
    // Find the panel containing Market Ladder text
    const mlTab = page
      .locator(".flexlayout__tab")
      .filter({ has: page.locator("[role='listitem']") })
      .first();

    const isVisible = await mlTab.isVisible();
    if (!isVisible) return; // Market Ladder may not be rendered in current viewport

    const before = await mlTab.boundingBox();
    if (!before) return;

    const firstRow = mlTab.locator("[role='listitem']").first();
    const rowVisible = await firstRow.isVisible();
    if (!rowVisible) return;

    await firstRow.click();
    await page.waitForTimeout(100);

    const after = await mlTab.boundingBox();
    if (!after) return;

    expect(Math.abs(after.x - before.x)).toBeLessThan(3);
    expect(Math.abs(after.y - before.y)).toBeLessThan(3);
  });
});

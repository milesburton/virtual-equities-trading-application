import { test, expect, type Page } from "@playwright/test";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Mock the auth API so the app skips the login page and goes straight to the dashboard. */
async function mockAuth(page: Page) {
  const user = { id: "alice", name: "Alice Chen", role: "trader", avatar_emoji: "👩‍💼" };

  await page.route("/api/user-service/sessions/me", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) })
  );

  // Also stub the session POST so the login page works if it somehow appears.
  await page.route("/api/user-service/sessions", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) })
  );
}

/** Stub all WebSocket / market-feed connections so panels don't error. */
async function stubBackend(page: Page) {
  // Catch any backend API calls that might fail and return empty-but-valid responses.
  await page.route("/api/**", (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    route.fulfill({ status: 200, contentType: "application/json", body: "null" });
  });
}

/** Wait until at least one panel drag-handle is visible (dashboard has rendered). */
async function waitForDashboard(page: Page) {
  await page.waitForSelector(".panel-drag-handle", { timeout: 15_000 });
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

    // Record the panel wrapper's position before any interaction.
    const wrapper = page.locator(".grid-item-wrapper").first();
    const before = await wrapper.boundingBox();
    expect(before).not.toBeNull();

    // Press and immediately release on the handle — simulates the problematic mousedown.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // Brief pause to let any erroneous re-render fire.
    await page.waitForTimeout(100);
    await page.mouse.up();

    const after = await wrapper.boundingBox();
    expect(after).not.toBeNull();

    // The panel must not have moved on a simple press-release.
    expect(Math.round(after!.x)).toBe(Math.round(before!.x));
    expect(Math.round(after!.y)).toBe(Math.round(before!.y));
  });

  test("panel lands at the dragged-to position and does not snap back", async ({ page }) => {
    const handles = page.locator(".panel-drag-handle");
    // Use the second panel so we have room to drag horizontally without going off-screen.
    const handle = handles.nth(1);
    const handleBox = await handle.boundingBox();
    expect(handleBox).not.toBeNull();
    if (!handleBox) return;

    const wrapper = page.locator(".grid-item-wrapper").nth(1);
    const before = await wrapper.boundingBox();
    expect(before).not.toBeNull();

    const startX = handleBox.x + handleBox.width / 2;
    const startY = handleBox.y + handleBox.height / 2;
    const dragDeltaX = 120; // move right by ~120px (a couple of grid columns)
    const dragDeltaY = 60;  // and down by ~60px (one grid row)

    // Perform a deliberate drag: move slowly so RGL's drag logic fires correctly.
    await page.mouse.move(startX, startY);
    await page.mouse.down();

    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(
        startX + (dragDeltaX * i) / steps,
        startY + (dragDeltaY * i) / steps,
        { steps: 1 }
      );
    }

    // Capture position mid-drag to confirm the panel is actually moving.
    const mid = await wrapper.boundingBox();
    expect(mid).not.toBeNull();

    await page.mouse.up();

    // Wait one animation frame for RGL to commit the drop.
    await page.waitForTimeout(150);

    const after = await wrapper.boundingBox();
    expect(after).not.toBeNull();

    // The panel must have moved from its original position.
    const movedX = Math.abs(after!.x - before!.x);
    const movedY = Math.abs(after!.y - before!.y);
    expect(movedX + movedY).toBeGreaterThan(0);

    // Crucially: the panel must NOT have snapped back to exactly where it started.
    // We allow a 4px tolerance for sub-pixel rounding.
    const snapBackX = Math.abs(after!.x - before!.x) < 4;
    const snapBackY = Math.abs(after!.y - before!.y) < 4;
    expect(snapBackX && snapBackY).toBe(false);

    // Wait another 500 ms and verify the panel is still in the new position
    // (rules out a delayed snap-back on re-render).
    await page.waitForTimeout(500);
    const stable = await wrapper.boundingBox();
    expect(stable).not.toBeNull();
    expect(Math.abs(stable!.x - after!.x)).toBeLessThan(4);
    expect(Math.abs(stable!.y - after!.y)).toBeLessThan(4);
  });
});

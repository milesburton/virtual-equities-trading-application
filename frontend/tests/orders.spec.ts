/**
 * Order submission and lifecycle tests.
 *
 * Tests cover:
 *   - Filling and submitting the Order Ticket sends a submitOrder WS message
 *   - The outbound message carries the correct asset, side, qty, and price
 *   - The blotter transitions queued → executing → filled via WS orderEvents
 *   - Gateway-level rejection (orderRejected event) marks order as rejected
 *   - Bus-level rejection (orders.rejected topic) marks order as rejected
 *   - Expired orders are shown with the expired badge
 *   - Limit violations disable the submit button and show a warning
 */

import { test, expect } from "@playwright/test";
import { AppPage } from "./helpers/pages/AppPage.ts";
import { DEFAULT_ASSETS, DEFAULT_LIMITS } from "./helpers/GatewayMock.ts";

// Price to pre-seed so the Order Ticket has a valid limit price from the start
const AAPL_PRICE = 189.50;

/** Set up a trader session with a price tick already sent, ready for order entry. */
async function setupWithPrice(page: Parameters<typeof AppPage>[0]["page"]) {
  const app = new AppPage(page);
  await app.gotoAsTrader(DEFAULT_ASSETS);

  // Send a price tick so the Order Ticket has a valid limit price
  app.gateway.sendMarketUpdate({ AAPL: AAPL_PRICE, MSFT: 421.00, GOOGL: 175.25 });
  await page.waitForTimeout(400); // let the 250ms batch flush + React re-render

  return app;
}

test.describe("Order submission", () => {
  // ── Outbound message ───────────────────────────────────────────────────────

  test("submitting an order sends a submitOrder WS message with correct fields", async ({ page }) => {
    const app = await setupWithPrice(page);
    const ticket = await app.getOrderTicket();

    // Fill the form — asset/price should already be AAPL at ~189.50 from the tick
    await ticket.fillOrder({ side: "BUY", quantity: 100, limitPrice: AAPL_PRICE });

    // Race: capture outbound message before clicking submit
    const outboundPromise = app.gateway.nextOutbound("submitOrder");
    await ticket.submit();

    const msg = await outboundPromise;
    expect(msg.payload.asset).toBe("AAPL");
    expect(msg.payload.side).toBe("BUY");
    expect(msg.payload.quantity).toBe(100);
    expect(msg.payload.limitPrice).toBeCloseTo(AAPL_PRICE, 1);
  });

  test("SELL order sends side=SELL in the WS message", async ({ page }) => {
    const app = await setupWithPrice(page);
    const ticket = await app.getOrderTicket();

    await ticket.fillOrder({ side: "SELL", quantity: 50, limitPrice: AAPL_PRICE });

    const outboundPromise = app.gateway.nextOutbound("submitOrder");
    await ticket.submit();

    const msg = await outboundPromise;
    expect(msg.payload.side).toBe("SELL");
    expect(msg.payload.quantity).toBe(50);
  });

  test("submit shows success feedback message", async ({ page }) => {
    const app = await setupWithPrice(page);
    const ticket = await app.getOrderTicket();

    await ticket.fillOrder({ quantity: 100, limitPrice: AAPL_PRICE });

    // Capture the clientOrderId from the outbound message
    const outboundPromise = app.gateway.nextOutbound("submitOrder");
    await ticket.submit();
    await outboundPromise;

    await ticket.expectSuccessFeedback();
  });

  // ── Order lifecycle in blotter ─────────────────────────────────────────────

  test("order appears in blotter immediately after submission (optimistic)", async ({ page }) => {
    const app = await setupWithPrice(page);

    await (await app.getOrderTicket()).fillOrder({ quantity: 100, limitPrice: AAPL_PRICE });
    await (await app.getOrderTicket()).submit();

    const blotter = await app.getOrderBlotter();
    await blotter.expectHasOrders();
    await blotter.expectAssetVisible("AAPL");
  });

  test("order transitions queued → executing → filled via WS events", async ({ page }) => {
    const app = await setupWithPrice(page);
    const blotter = await app.getOrderBlotter();

    // Capture clientOrderId from submit
    const outboundPromise = app.gateway.nextOutbound("submitOrder");
    await (await app.getOrderTicket()).fillOrder({ quantity: 100, limitPrice: AAPL_PRICE });
    await (await app.getOrderTicket()).submit();
    const msg = await outboundPromise;
    const clientOrderId = msg.payload.clientOrderId as string;

    // queued
    await blotter.waitForStatus("queued");

    // submitted → executing
    app.gateway.sendOrderLifecycle(clientOrderId, {
      asset: "AAPL",
      quantity: 100,
      limitPrice: AAPL_PRICE,
      stages: ["submitted", "routed"],
    });
    await blotter.waitForStatus("executing");

    // filled
    app.gateway.sendOrderLifecycle(clientOrderId, {
      asset: "AAPL",
      quantity: 100,
      limitPrice: AAPL_PRICE,
      stages: ["filled"],
    });
    await blotter.waitForStatus("filled");
  });

  // ── Rejection flows ────────────────────────────────────────────────────────

  test("gateway orderRejected event marks order as rejected in blotter", async ({ page }) => {
    const app = await setupWithPrice(page);
    const blotter = await app.getOrderBlotter();

    const outboundPromise = app.gateway.nextOutbound("submitOrder");
    await (await app.getOrderTicket()).fillOrder({ quantity: 100, limitPrice: AAPL_PRICE });
    await (await app.getOrderTicket()).submit();
    const msg = await outboundPromise;
    const clientOrderId = msg.payload.clientOrderId as string;

    // Gateway rejects at auth level
    app.gateway.sendOrderRejected(clientOrderId, "Unauthenticated — please log in again");
    await blotter.waitForStatus("rejected");
  });

  test("bus-level orders.rejected event marks order as rejected", async ({ page }) => {
    const app = await setupWithPrice(page);
    const blotter = await app.getOrderBlotter();

    const outboundPromise = app.gateway.nextOutbound("submitOrder");
    await (await app.getOrderTicket()).fillOrder({ quantity: 100, limitPrice: AAPL_PRICE });
    await (await app.getOrderTicket()).submit();
    const msg = await outboundPromise;
    const clientOrderId = msg.payload.clientOrderId as string;

    // OMS rejects on bus
    app.gateway.sendOrderLifecycle(clientOrderId, {
      stages: ["rejected"],
    });
    await blotter.waitForStatus("rejected");
  });

  test("orders.expired event marks order as expired", async ({ page }) => {
    const app = await setupWithPrice(page);
    const blotter = await app.getOrderBlotter();

    const outboundPromise = app.gateway.nextOutbound("submitOrder");
    await (await app.getOrderTicket()).fillOrder({ quantity: 100, limitPrice: AAPL_PRICE });
    await (await app.getOrderTicket()).submit();
    const msg = await outboundPromise;
    const clientOrderId = msg.payload.clientOrderId as string;

    app.gateway.sendOrderLifecycle(clientOrderId, {
      stages: ["submitted", "expired"],
    });
    await blotter.waitForStatus("expired");
  });

  // ── Trading limits ─────────────────────────────────────────────────────────

  test("quantity exceeding max_order_qty shows warning and disables submit", async ({ page }) => {
    const app = new AppPage(page);
    await app.goto({ user: { id: "t1", name: "Trader", role: "trader", avatar_emoji: "T" } });
    await app.waitForDashboard();

    // Send tight limits: max 50 shares
    app.gateway.sendAuthIdentity({
      limits: { ...DEFAULT_LIMITS, max_order_qty: 50 },
    });

    // Send price tick so limit price can be populated
    app.gateway.sendMarketUpdate({ AAPL: AAPL_PRICE });
    await page.waitForTimeout(400);

    await (await app.getOrderTicket()).fillOrder({ quantity: 100, limitPrice: AAPL_PRICE });
    await (await app.getOrderTicket()).expectLimitWarning(/exceeds your limit/i);
    await (await app.getOrderTicket()).expectSubmitDisabled();
  });

  test("notional exceeding max_daily_notional shows warning and disables submit", async ({ page }) => {
    const app = new AppPage(page);
    await app.goto({ user: { id: "t1", name: "Trader", role: "trader", avatar_emoji: "T" } });
    await app.waitForDashboard();

    // Max notional: $1,000 — 100 × 189.50 = $18,950 > $1,000
    app.gateway.sendAuthIdentity({
      limits: { ...DEFAULT_LIMITS, max_daily_notional: 1_000 },
    });

    app.gateway.sendMarketUpdate({ AAPL: AAPL_PRICE });
    await page.waitForTimeout(400);

    await (await app.getOrderTicket()).fillOrder({ quantity: 100, limitPrice: AAPL_PRICE });
    await (await app.getOrderTicket()).expectLimitWarning(/exceeds your daily limit/i);
    await (await app.getOrderTicket()).expectSubmitDisabled();
  });
});

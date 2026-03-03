import { assertEquals } from "https://deno.land/std@0.210.0/testing/asserts.ts";

const OMS_URL = "http://localhost:5002";
const EMS_URL = "http://localhost:5001";
const LIMIT_URL = "http://localhost:5003";
const TWAP_URL = "http://localhost:5004";
const POV_URL = "http://localhost:5005";
const VWAP_URL = "http://localhost:5006";

const VALID_TRADE = {
  asset: "AAPL",
  side: "BUY",
  quantity: 10,
  limitPrice: 150.0,
  expiresAt: 60,
};

function post(url: string, body: unknown) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

Deno.test("OMS - accepts valid trade and returns success", async () => {
  const res = await post(OMS_URL, { ...VALID_TRADE, strategy: "LIMIT" });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
});

Deno.test("OMS - OPTIONS preflight returns 204", async () => {
  const res = await fetch(OMS_URL, { method: "OPTIONS" });
  assertEquals(res.status, 204);
  await res.body?.cancel();
});

Deno.test("OMS - GET returns 405", async () => {
  const res = await fetch(OMS_URL);
  assertEquals(res.status, 405);
  await res.body?.cancel();
});

Deno.test("EMS - executes trade and returns new fill fields", async () => {
  const res = await post(EMS_URL, { asset: "AAPL", side: "BUY", quantity: 5 });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  // New fields from partial-fill model
  assertEquals(typeof body.filledQty, "number");
  assertEquals(typeof body.remainingQty, "number");
  assertEquals(typeof body.avgFillPrice, "number");
  assertEquals(typeof body.marketImpactBps, "number");
  assertEquals(body.filledQty + body.remainingQty, 5);
  // Backward-compat fields
  assertEquals(typeof body.price, "number");
  assertEquals(typeof body.totalCost, "number");
});

Deno.test("EMS - rejects unknown asset", async () => {
  const res = await post(EMS_URL, { asset: "UNKNOWN", side: "BUY", quantity: 5 });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.success, false);
});

Deno.test("EMS - OPTIONS preflight returns 204", async () => {
  const res = await fetch(EMS_URL, { method: "OPTIONS" });
  assertEquals(res.status, 204);
  await res.body?.cancel();
});

Deno.test("Limit algo - queues valid trade and returns success", async () => {
  const res = await post(LIMIT_URL, VALID_TRADE);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
});

Deno.test("Limit algo - OPTIONS preflight returns 204", async () => {
  const res = await fetch(LIMIT_URL, { method: "OPTIONS" });
  assertEquals(res.status, 204);
  await res.body?.cancel();
});

Deno.test("TWAP algo - accepts trade and starts execution", async () => {
  const res = await post(TWAP_URL, VALID_TRADE);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
});

Deno.test("TWAP algo - OPTIONS preflight returns 204", async () => {
  const res = await fetch(TWAP_URL, { method: "OPTIONS" });
  assertEquals(res.status, 204);
  await res.body?.cancel();
});

Deno.test("POV algo - accepts trade and starts execution", async () => {
  const res = await post(POV_URL, VALID_TRADE);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(typeof body.orderId, "string");
});

Deno.test("POV algo - OPTIONS preflight returns 204", async () => {
  const res = await fetch(POV_URL, { method: "OPTIONS" });
  assertEquals(res.status, 204);
  await res.body?.cancel();
});

Deno.test("VWAP algo - accepts trade and returns orderId", async () => {
  const res = await post(VWAP_URL, {
    ...VALID_TRADE,
    algoParams: { maxDeviation: 0.005, maxSlice: 500 },
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(typeof body.orderId, "string");
});

Deno.test("VWAP algo - OPTIONS preflight returns 204", async () => {
  const res = await fetch(VWAP_URL, { method: "OPTIONS" });
  assertEquals(res.status, 204);
  await res.body?.cancel();
});

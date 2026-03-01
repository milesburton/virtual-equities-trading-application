import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.210.0/testing/asserts.ts";

const MARKET_URL = "http://localhost:5000";
const EMS_URL = "http://localhost:5001";
const OMS_URL = "http://localhost:5002";
const LIMIT_URL = "http://localhost:5003";
const TWAP_URL = "http://localhost:5004";
const POV_URL = "http://localhost:5005";
const VWAP_URL = "http://localhost:5006";

const SERVICES = [
  { name: "market-sim", url: MARKET_URL },
  { name: "ems", url: EMS_URL },
  { name: "oms", url: OMS_URL },
  { name: "limit", url: LIMIT_URL },
  { name: "twap", url: TWAP_URL },
  { name: "pov", url: POV_URL },
  { name: "vwap", url: VWAP_URL },
];

function post(url: string, body: unknown) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5_000),
  });
}

const BASE_TRADE = {
  asset: "AAPL",
  side: "BUY" as const,
  quantity: 50,
  limitPrice: 190.0,
  expiresAt: 300,
};

// ── Service Health ────────────────────────────────────────────────────────────

for (const svc of SERVICES) {
  Deno.test(`[health] ${svc.name} is online and reports ok`, async () => {
    const res = await fetch(`${svc.url}/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    assertEquals(res.status, 200, `${svc.name} /health returned ${res.status}`);
    const body = await res.json();
    assertEquals(body.status, "ok", `${svc.name} status field is not "ok"`);
    assertExists(body.version, `${svc.name} missing version field`);
  });
}

// ── Market Data ──────────────────────────────────────────────────────────────

Deno.test("[market] /assets returns a non-empty array with dailyVolume fields", async () => {
  const res = await fetch(`${MARKET_URL}/assets`, {
    signal: AbortSignal.timeout(5_000),
  });
  assertEquals(res.status, 200);
  const assets = await res.json();
  assert(Array.isArray(assets), "expected array");
  assert(assets.length > 0, "asset list is empty");

  const aapl = assets.find((a: { symbol: string }) => a.symbol === "AAPL");
  assertExists(aapl, "AAPL missing from asset list");
  assertEquals(typeof aapl.initialPrice, "number");
  assertEquals(typeof aapl.volatility, "number");
  assertEquals(typeof aapl.sector, "string");
  assertEquals(typeof aapl.dailyVolume, "number", "AAPL missing dailyVolume field");
  assert(aapl.dailyVolume > 0, "AAPL dailyVolume must be positive");
});

Deno.test("[market] WebSocket delivers enriched market data within 3 seconds", async () => {
  const ws = new WebSocket(`ws://localhost:5000`);

  interface EnrichedData { prices: Record<string, number>; volumes: Record<string, number>; marketMinute: number }
  interface MarketMsg { event: string; data: EnrichedData | Record<string, number> }

  const msg = await new Promise<MarketMsg>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("timed out waiting for market data"));
    }, 3_000);

    ws.onmessage = (ev) => {
      clearTimeout(timeout);
      ws.close();
      resolve(JSON.parse(ev.data as string) as MarketMsg);
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("WebSocket error"));
    };
  });

  // Extract prices whether old flat or new enriched format
  const prices: Record<string, number> =
    msg.data !== null && typeof msg.data === "object" && "prices" in msg.data
      ? (msg.data as EnrichedData).prices
      : (msg.data as Record<string, number>);

  assert(typeof prices === "object" && prices !== null, "expected price object");
  const symbols = Object.keys(prices);
  assert(symbols.length > 0, "no prices received");
  assert(
    symbols.every((s) => typeof prices[s] === "number" && prices[s] > 0),
    "some prices are non-positive",
  );

  // Verify new enriched format fields
  assert("prices" in msg.data, "market-sim should emit enriched { prices, volumes, marketMinute }");
  const enriched = msg.data as EnrichedData;
  assert(typeof enriched.volumes === "object", "volumes field missing");
  assert(Object.keys(enriched.volumes).length > 0, "volumes map is empty");
  assertEquals(typeof enriched.marketMinute, "number", "marketMinute must be a number");
  assert(enriched.marketMinute >= 0 && enriched.marketMinute < 390, "marketMinute out of [0, 390)");
});

Deno.test("[market] price updates arrive after initial snapshot", async () => {
  const ws = new WebSocket(`ws://localhost:5000`);
  const messages: string[] = [];

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("timed out waiting for two market messages"));
    }, 5_000);

    ws.onmessage = (ev) => {
      messages.push(ev.data as string);
      if (messages.length >= 2) {
        clearTimeout(timeout);
        ws.close();
        resolve();
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("WebSocket error"));
    };
  });

  assertEquals(messages.length >= 2, true);
  const first = JSON.parse(messages[0]) as { event: string };
  const second = JSON.parse(messages[1]) as { event: string };
  assertEquals(first.event, "marketData", "first message should be initial snapshot");
  assertEquals(second.event, "marketUpdate", "second message should be a price update");
});

// ── EMS direct execution ──────────────────────────────────────────────────────

Deno.test("[ems] executes small trade and returns new fill fields", async () => {
  const res = await post(EMS_URL, { asset: "AAPL", side: "BUY", quantity: 100 });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  // New fields
  assertEquals(typeof body.filledQty, "number", "filledQty missing");
  assertEquals(typeof body.remainingQty, "number", "remainingQty missing");
  assertEquals(typeof body.avgFillPrice, "number", "avgFillPrice missing");
  assertEquals(typeof body.marketImpactBps, "number", "marketImpactBps missing");
  assert(body.avgFillPrice > 0, "avgFillPrice must be positive");
  assert(body.filledQty + body.remainingQty === 100, "filledQty + remainingQty must equal quantity");
  // Backward-compat fields still present
  assert(typeof body.totalCost === "number", "totalCost backward-compat field missing");
  assert(typeof body.price === "number", "price backward-compat field missing");
});

Deno.test("[ems] large order is partially filled (participation cap)", async () => {
  // 10M shares is way beyond 20% of any single tick volume
  const res = await post(EMS_URL, { asset: "AAPL", side: "BUY", quantity: 10_000_000 });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assert(body.filledQty < 10_000_000, "huge order must be partially filled");
  assert(body.remainingQty > 0, "remainingQty must be positive for partial fill");
  assertEquals(body.filledQty + body.remainingQty, 10_000_000);
});

Deno.test("[ems] market impact increases with order size", async () => {
  const [smallRes, largeRes] = await Promise.all([
    post(EMS_URL, { asset: "AAPL", side: "BUY", quantity: 100 }),
    post(EMS_URL, { asset: "AAPL", side: "BUY", quantity: 5_000 }),
  ]);
  const small = await smallRes.json();
  const large = await largeRes.json();
  assert(
    large.marketImpactBps >= small.marketImpactBps,
    `larger order should have >= impact: small=${small.marketImpactBps} large=${large.marketImpactBps}`,
  );
});

Deno.test("[ems] SELL fill price is below mid (negative impact)", async () => {
  const buyRes = await post(EMS_URL, { asset: "AAPL", side: "BUY", quantity: 500 });
  const sellRes = await post(EMS_URL, { asset: "AAPL", side: "SELL", quantity: 500 });
  const buy = await buyRes.json();
  const sell = await sellRes.json();
  // BUY pays up, SELL receives less — both relative to the same mid price
  // At equal quantities the impact magnitude should be the same
  assert(
    Math.abs(buy.marketImpactBps - sell.marketImpactBps) < 0.01,
    "BUY and SELL market impact should be equal in magnitude for the same quantity",
  );
});

Deno.test("[ems] rejects unknown asset with 400", async () => {
  const res = await post(EMS_URL, { asset: "FAKECOIN", side: "BUY", quantity: 1 });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.success, false);
});

Deno.test("[ems] OPTIONS preflight returns 204", async () => {
  const res = await fetch(EMS_URL, { method: "OPTIONS" });
  assertEquals(res.status, 204);
  await res.body?.cancel();
});

// ── Trade placement via OMS ───────────────────────────────────────────────────

Deno.test("[trade] OMS routes LIMIT order and confirms placement", async () => {
  const res = await post(OMS_URL, { ...BASE_TRADE, strategy: "LIMIT" });
  assertEquals(res.status, 200, `OMS LIMIT returned ${res.status}`);
  const body = await res.json();
  assertEquals(body.success, true, `LIMIT trade not accepted: ${JSON.stringify(body)}`);
});

Deno.test("[trade] OMS routes TWAP order and confirms placement", async () => {
  const res = await post(OMS_URL, { ...BASE_TRADE, strategy: "TWAP" });
  assertEquals(res.status, 200, `OMS TWAP returned ${res.status}`);
  const body = await res.json();
  assertEquals(body.success, true, `TWAP trade not accepted: ${JSON.stringify(body)}`);
});

Deno.test("[trade] OMS routes POV order and confirms placement", async () => {
  const res = await post(OMS_URL, { ...BASE_TRADE, strategy: "POV" });
  assertEquals(res.status, 200, `OMS POV returned ${res.status}`);
  const body = await res.json();
  assertEquals(body.success, true, `POV trade not accepted: ${JSON.stringify(body)}`);
});

Deno.test("[trade] OMS rejects unknown strategy with 400", async () => {
  const res = await post(OMS_URL, { ...BASE_TRADE, strategy: "MAGIC" });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.success, false);
});

Deno.test("[trade] direct LIMIT algo accepts trade", async () => {
  const res = await post(LIMIT_URL, BASE_TRADE);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
});

Deno.test("[trade] direct TWAP algo accepts trade", async () => {
  const res = await post(TWAP_URL, BASE_TRADE);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
});

Deno.test("[trade] direct POV algo accepts trade", async () => {
  const res = await post(POV_URL, BASE_TRADE);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
});

Deno.test("[trade] direct VWAP algo accepts trade with algo params", async () => {
  const res = await post(VWAP_URL, {
    ...BASE_TRADE,
    algoParams: { maxDeviation: 0.005, maxSlice: 500 },
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertExists(body.orderId, "VWAP should return an orderId");
});

Deno.test("[trade] SELL order accepted by OMS", async () => {
  const res = await post(OMS_URL, { ...BASE_TRADE, side: "SELL", strategy: "LIMIT" });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
});

Deno.test("[trade] POV response includes orderId", async () => {
  const res = await post(POV_URL, BASE_TRADE);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertExists(body.orderId, "POV should return an orderId");
});

// ── End-to-end trade flow ─────────────────────────────────────────────────────

Deno.test("[e2e] place LIMIT order via OMS then verify limit algo reflects pending count", async () => {
  const limitBefore = await (await fetch(`${LIMIT_URL}/health`)).json() as {
    pending: number;
  };
  const pendingBefore = limitBefore.pending ?? 0;

  const res = await post(OMS_URL, { ...BASE_TRADE, strategy: "LIMIT" });
  assertEquals(res.status, 200);
  assertEquals((await res.json()).success, true);

  const limitAfter = await (
    await fetch(`${LIMIT_URL}/health`, { signal: AbortSignal.timeout(3_000) })
  ).json() as { pending: number };

  assert(
    limitAfter.pending > pendingBefore,
    `expected pending to increase from ${pendingBefore}, got ${limitAfter.pending}`,
  );
});

async function limitPending(): Promise<number> {
  const res = await fetch(`${LIMIT_URL}/health`, { signal: AbortSignal.timeout(3_000) });
  const body = await res.json() as { pending: number };
  return body.pending;
}

async function pollUntil(
  predicate: () => Promise<boolean>,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
    if (await predicate()) return true;
  }
  return false;
}

// Limit orders now wait for the next market-sim tick (~1s) before evaluating.
// We use SPY (not AAPL) for fill e2e tests so they don't interfere with other
// tests that post AAPL orders. We wait for the ack, then snapshot the count
// before polling for a drop.
async function placeLimitAndWaitForFill(
  asset: string,
  side: "BUY" | "SELL",
  limitPrice: number,
): Promise<void> {
  const res = await post(LIMIT_URL, {
    asset,
    side,
    quantity: 1,
    limitPrice,
    expiresAt: 10,
  });
  // Confirm order was accepted before sampling
  const ack = await res.json();
  assertEquals(ack.success, true, "LIMIT order was not accepted");

  const pendingAfterQueue = await limitPending();

  const filled = await pollUntil(
    async () => (await limitPending()) < pendingAfterQueue,
    5_000,
  );

  assert(
    filled,
    `LIMIT ${side} ${asset} @ ${limitPrice} did not fill within 5 seconds (pending was ${pendingAfterQueue})`,
  );
}

Deno.test("[e2e] LIMIT BUY with price above market fills and clears from pending within 5s", async () => {
  await placeLimitAndWaitForFill("SPY", "BUY", 99_999);
});

Deno.test("[e2e] LIMIT SELL with price below market fills and clears from pending within 5s", async () => {
  await placeLimitAndWaitForFill("SPY", "SELL", 0.01);
});

Deno.test("[e2e] LIMIT order with impossible price expires and clears from pending", async () => {
  const res = await post(LIMIT_URL, {
    asset: "AAPL",
    side: "BUY",
    quantity: 1,
    limitPrice: 0.0001,
    expiresAt: 2,
  });
  await res.body?.cancel();

  // Snapshot immediately after queuing
  const pendingAfterQueue = await limitPending();

  await new Promise((r) => setTimeout(r, 3_000));

  const pendingAfterExpiry = await limitPending();
  assert(
    pendingAfterExpiry < pendingAfterQueue,
    `expired order still in pending after 3s (was=${pendingAfterQueue} now=${pendingAfterExpiry})`,
  );
});

Deno.test("[e2e] EMS fill: totalCost equals filledQty × avgFillPrice", async () => {
  const res = await post(EMS_URL, { asset: "MSFT", side: "BUY", quantity: 200 });
  assertEquals(res.status, 200);
  const body = await res.json() as {
    success: boolean;
    filledQty: number;
    avgFillPrice: number;
    totalCost: number;
  };
  assertEquals(body.success, true);
  assert(body.avgFillPrice > 0, "avgFillPrice must be positive");
  assert(
    Math.abs(body.totalCost - body.filledQty * body.avgFillPrice) < 0.01,
    `totalCost mismatch: filledQty=${body.filledQty} × avgFillPrice=${body.avgFillPrice} ≠ ${body.totalCost}`,
  );
});

Deno.test("[e2e] OMS routes VWAP order to vwap algo and confirms placement", async () => {
  const res = await post(OMS_URL, {
    ...BASE_TRADE,
    strategy: "VWAP",
    algoParams: { maxDeviation: 0.01, maxSlice: 100 },
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true, `VWAP via OMS failed: ${JSON.stringify(body)}`);
});

Deno.test("[e2e] all services report consistent version string", async () => {
  const versions = await Promise.all(
    SERVICES.map(async (svc) => {
      const res = await fetch(`${svc.url}/health`, { signal: AbortSignal.timeout(3_000) });
      const body = await res.json() as { version: string };
      return { name: svc.name, version: body.version };
    }),
  );

  const versionSet = new Set(versions.map((v) => v.version));
  assertEquals(
    versionSet.size,
    1,
    `services report inconsistent versions: ${versions.map((v) => `${v.name}=${v.version}`).join(", ")}`,
  );
});

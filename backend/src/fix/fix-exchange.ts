// FIX 4.4 Exchange — TCP listener on port 9880 (internal only)
// Accepts FIX sessions from fix-gateway, processes NewOrderSingle messages,
// and returns ExecutionReports using simulated fills from the market-sim.

import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { ExecType, MsgType, OrdStatus, OrdType, Side, Tag } from "./fix-dictionary.ts";
import { utcTimestamp } from "./fix-parser.ts";
import { FixSession } from "./fix-session.ts";
import { MarketSimClient } from "../lib/marketSimClient.ts";

const FIX_EXCHANGE_PORT = Number(Deno.env.get("FIX_EXCHANGE_PORT")) || 9_880;
const MARKET_SIM_HOST = Deno.env.get("MARKET_SIM_HOST") || "localhost";
const MARKET_SIM_PORT = Number(Deno.env.get("MARKET_SIM_PORT")) || 5_000;
const PARTICIPATION_CAP = Number(Deno.env.get("EMS_PARTICIPATION_CAP")) || 0.20;
const IMPACT_PER_1000 = Number(Deno.env.get("EMS_IMPACT_PER_1000_BPS")) || 1.0;
const VERSION = Deno.env.get("COMMIT_SHA") || "dev";

// ─── Market data client ──────────────────────────────────────────────────────

const marketClient = new MarketSimClient(MARKET_SIM_HOST, MARKET_SIM_PORT);
marketClient.start();

// ─── Fill simulation (same logic as EMS) ────────────────────────────────────

interface FillResult {
  filledQty: number;
  remainingQty: number;
  avgFillPrice: number;
  marketImpactBps: number;
}

function computeFill(
  requestedQty: number,
  side: "BUY" | "SELL",
  midPrice: number,
  tickVolume: number,
): FillResult {
  const maxFill = Math.floor(tickVolume * PARTICIPATION_CAP);
  const filledQty = Math.min(requestedQty, maxFill);
  const remainingQty = requestedQty - filledQty;
  const impactBps = (filledQty / 1_000) * IMPACT_PER_1000;
  const impactFactor = side === "BUY" ? 1 + impactBps / 10_000 : 1 - impactBps / 10_000;
  const avgFillPrice = parseFloat((midPrice * impactFactor).toFixed(4));
  return { filledQty, remainingQty, avgFillPrice, marketImpactBps: impactBps };
}

// ─── Connection handler ──────────────────────────────────────────────────────

const SOH = "\x01";

async function handleConnection(conn: Deno.TcpConn): Promise<void> {
  const remote = `${conn.remoteAddr.hostname}:${conn.remoteAddr.port}`;
  console.log(`[FIX Exchange] Connection from ${remote}`);

  let execIdCounter = 1;
  let buffer = "";

  const session = new FixSession({
    senderCompID: "EXCHANGE",
    targetCompID: "GATEWAY",
    heartBtInt: 30,
    onSend: async (msg: string) => {
      try {
        await conn.write(new TextEncoder().encode(msg));
      } catch {
        // connection may have closed
      }
    },
    onApplicationMessage: (tags: Map<number, string>) => {
      handleApplicationMessage(tags).catch((err) => {
        console.error("[FIX Exchange] Error processing message:", err);
      });
    },
    onStateChange: (state) => {
      console.log(`[FIX Exchange] Session state → ${state} (${remote})`);
    },
  });

  async function handleApplicationMessage(tags: Map<number, string>): Promise<void> {
    const msgType = tags.get(Tag.MsgType);
    if (msgType !== MsgType.NewOrderSingle) return;

    const clOrdId = tags.get(Tag.ClOrdID) ?? "";
    const symbol = tags.get(Tag.Symbol) ?? "";
    const sideRaw = tags.get(Tag.Side);
    const orderQty = Number(tags.get(Tag.OrderQty) ?? "0");
    const price = Number(tags.get(Tag.Price) ?? "0");
    const ordType = tags.get(Tag.OrdType) ?? OrdType.Limit;

    const side: "BUY" | "SELL" = sideRaw === Side.Sell ? "SELL" : "BUY";
    const orderId = `EX-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    console.log(`[FIX Exchange] NOS: clOrdId=${clOrdId} symbol=${symbol} side=${side} qty=${orderQty} price=${price}`);

    // ExecReport: New (acknowledge receipt)
    const ackExecId = `${execIdCounter++}`;
    session.sendMessage([
      [Tag.MsgType, MsgType.ExecutionReport],
      [Tag.OrderID, orderId],
      [Tag.ClOrdID, clOrdId],
      [Tag.ExecID, ackExecId],
      [Tag.ExecType, ExecType.New],
      [Tag.OrdStatus, OrdStatus.New],
      [Tag.Symbol, symbol],
      [Tag.Side, sideRaw ?? Side.Buy],
      [Tag.OrdType, ordType],
      [Tag.LeavesQty, orderQty],
      [Tag.CumQty, 0],
      [Tag.AvgPx, 0],
      [Tag.TransactTime, utcTimestamp()],
    ]);

    // Simulated exchange latency: 10–50ms
    const latencyMs = 10 + Math.floor(Math.random() * 40);
    await new Promise((r) => setTimeout(r, latencyMs));

    // Determine fill using market data
    const tick = marketClient.getLatest();
    const midPrice = tick.prices[symbol] ?? price;
    const tickVolume = tick.volumes[symbol] ?? 1_000;

    let cumQty = 0;
    let remainingQty = orderQty;

    // Fill in up to 3 partial slices to simulate realistic execution
    let sliceNum = 0;
    while (remainingQty > 0 && sliceNum < 3) {
      sliceNum++;

      const fill = computeFill(remainingQty, side, midPrice, tickVolume);

      if (fill.filledQty === 0) break; // no more liquidity

      cumQty += fill.filledQty;
      remainingQty = fill.remainingQty;

      const isFinal = remainingQty === 0;
      const execType = isFinal ? ExecType.Fill : ExecType.PartialFill;
      const ordStatus = isFinal ? OrdStatus.Filled : OrdStatus.PartiallyFilled;

      const fillExecId = `${execIdCounter++}`;
      session.sendMessage([
        [Tag.MsgType, MsgType.ExecutionReport],
        [Tag.OrderID, orderId],
        [Tag.ClOrdID, clOrdId],
        [Tag.ExecID, fillExecId],
        [Tag.ExecType, execType],
        [Tag.OrdStatus, ordStatus],
        [Tag.Symbol, symbol],
        [Tag.Side, sideRaw ?? Side.Buy],
        [Tag.OrdType, ordType],
        [Tag.LastQty, fill.filledQty],
        [Tag.LastPx, fill.avgFillPrice],
        [Tag.LeavesQty, remainingQty],
        [Tag.CumQty, cumQty],
        [Tag.AvgPx, fill.avgFillPrice],
        [Tag.TransactTime, utcTimestamp()],
      ]);

      console.log(
        `[FIX Exchange] Fill: clOrdId=${clOrdId} ${fill.filledQty}/${orderQty} @ ${fill.avgFillPrice}` +
          ` leaves=${remainingQty} impact=${fill.marketImpactBps.toFixed(2)}bps`,
      );

      if (!isFinal) {
        // Small gap between partial fills
        await new Promise((r) => setTimeout(r, 50 + Math.floor(Math.random() * 100)));
      }
    }
  }

  // Read loop — reassemble SOH-delimited FIX messages from the TCP stream
  const readBuf = new Uint8Array(4096);
  try {
    while (true) {
      const bytesRead = await conn.read(readBuf);
      if (bytesRead === null) break; // EOF

      buffer += new TextDecoder().decode(readBuf.subarray(0, bytesRead));

      // A FIX message ends with 10=<checksum><SOH>
      // Split on the checksum trailer pattern so we handle multiple messages per read
      let msgEnd: number;
      while ((msgEnd = buffer.indexOf(`${SOH}10=`)) !== -1) {
        // Find the SOH after the checksum value (3 digits + SOH)
        const trailerEnd = msgEnd + 7; // \x0110=XXX\x01 = 7 chars
        if (trailerEnd > buffer.length) break; // incomplete

        const raw = buffer.slice(0, trailerEnd);
        buffer = buffer.slice(trailerEnd);
        session.handleInbound(raw);
      }
    }
  } catch (err) {
    if (!(err instanceof Deno.errors.BadResource)) {
      console.error(`[FIX Exchange] Read error (${remote}):`, err);
    }
  } finally {
    session.disconnect();
    try { conn.close(); } catch { /* already closed */ }
    console.log(`[FIX Exchange] Connection closed (${remote})`);
  }
}

// ─── Health endpoint (HTTP on same port prefix) ──────────────────────────────
// The exchange exposes a plain HTTP GET /health on port 9880 + 1 = 9879
// (keep TCP clean; health check on a separate port)

const HEALTH_PORT = FIX_EXCHANGE_PORT - 1; // 9879

Deno.serve({ port: HEALTH_PORT }, (req) => {
  if (new URL(req.url).pathname === "/health") {
    return new Response(
      JSON.stringify({ service: "fix-exchange", version: VERSION, status: "ok" }),
      { headers: { "Content-Type": "application/json" } },
    );
  }
  return new Response("Not found", { status: 404 });
});

// ─── TCP listener ─────────────────────────────────────────────────────────────

const listener = Deno.listen({ port: FIX_EXCHANGE_PORT });
console.log(`[FIX Exchange] Listening on TCP port ${FIX_EXCHANGE_PORT} (health: ${HEALTH_PORT})`);
console.log(`[FIX Exchange] version=${VERSION}`);

for await (const conn of listener) {
  handleConnection(conn as Deno.TcpConn).catch((err) => {
    console.error("[FIX Exchange] Unhandled connection error:", err);
  });
}

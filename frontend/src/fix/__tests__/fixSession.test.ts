/* biome-ignore lint/style/noNonNullAssertion: test file assertions */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderRecord } from "../../types";
import { decode, encode, MsgType, Tag } from "../fixCodec";
import type { SessionConfig } from "../fixSession";
import { FIXSession } from "../fixSession";

// ─── Helpers ──────────────────────────────────────────────────────────────────

import type { ExecReportPayload } from "../fixSession";

function makeSession(overrides?: Partial<SessionConfig>) {
  const sent: string[] = [];
  const states: string[] = [];
  const execReports: ExecReportPayload[] = [];

  const session = new FIXSession({
    senderCompID: "TRADER",
    targetCompID: "EXCHANGE",
    heartBtInt: 30,
    onSend: (msg) => sent.push(msg),
    onStateChange: (s) => states.push(s),
    onExecReport: (r) => execReports.push(r),
    ...(overrides || {}),
  });

  return { session, sent, states, execReports };
}

function buildExchangeMessage(tags: [number, string | number][], senderSeq: number): string {
  return encode([
    tags[0], // MsgType
    [Tag.SenderCompID, "EXCHANGE"],
    [Tag.TargetCompID, "TRADER"],
    [Tag.MsgSeqNum, senderSeq],
    [Tag.SendingTime, "20250101-12:00:00.000"],
    ...tags.slice(1),
  ]);
}

function buildLogonMsg(seq = 1, heartBtInt = 30) {
  return buildExchangeMessage(
    [
      [Tag.MsgType, MsgType.Logon],
      [Tag.EncryptMethod, 0],
      [Tag.HeartBtInt, heartBtInt],
    ],
    seq
  );
}

function makeOrder(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: "order-001",
    submittedAt: Date.now(),
    asset: "AAPL",
    side: "BUY",
    quantity: 100,
    limitPrice: 150.0,
    expiresAt: Date.now() + 60_000,
    strategy: "LIMIT",
    status: "queued",
    filled: 0,
    algoParams: { strategy: "LIMIT" },
    children: [],
    ...overrides,
  };
}

// ─── Session state transitions ────────────────────────────────────────────────

describe("FIXSession – state transitions", () => {
  it("starts in DISCONNECTED state", () => {
    const { session } = makeSession();
    expect(session.sessionState).toBe("DISCONNECTED");
  });

  it("transitions to LOGON_SENT after sendLogon", () => {
    const { session } = makeSession();
    session.sendLogon();
    expect(session.sessionState).toBe("LOGON_SENT");
  });

  it("transitions to ACTIVE after receiving Logon response", () => {
    const { session } = makeSession();
    session.sendLogon();
    session.handleInbound(buildLogonMsg());
    expect(session.sessionState).toBe("ACTIVE");
  });

  it("fires onStateChange callbacks in order", () => {
    const { session, states } = makeSession();
    session.sendLogon();
    session.handleInbound(buildLogonMsg());
    expect(states).toEqual(["LOGON_SENT", "ACTIVE"]);
  });

  it("transitions to LOGOUT_SENT after sendLogout", () => {
    const { session } = makeSession();
    session.sendLogon();
    session.handleInbound(buildLogonMsg());
    session.sendLogout();
    expect(session.sessionState).toBe("LOGOUT_SENT");
  });

  it("transitions to DISCONNECTED after receiving Logout from ACTIVE state", () => {
    const { session } = makeSession();
    session.sendLogon();
    session.handleInbound(buildLogonMsg());
    const logoutMsg = buildExchangeMessage(
      [
        [Tag.MsgType, MsgType.Logout],
        [Tag.Text, "bye"],
      ],
      2
    );
    session.handleInbound(logoutMsg);
    expect(session.sessionState).toBe("DISCONNECTED");
  });

  it("transitions to DISCONNECTED after disconnect()", () => {
    const { session } = makeSession();
    session.sendLogon();
    session.handleInbound(buildLogonMsg());
    session.disconnect();
    expect(session.sessionState).toBe("DISCONNECTED");
  });

  it("Logon received when not in LOGON_SENT state does not activate", () => {
    const { session } = makeSession();
    // Feed a Logon without having called sendLogon first
    session.handleInbound(buildLogonMsg(1));
    expect(session.sessionState).toBe("DISCONNECTED");
  });
});

// ─── Outbound Logon message ───────────────────────────────────────────────────

describe("FIXSession – sendLogon", () => {
  it("sends a Logon message (35=A)", () => {
    const { session, sent } = makeSession();
    session.sendLogon();
    expect(sent).toHaveLength(1);
    const tags = decode(sent[0]);
    expect(tags.get(Tag.MsgType)).toBe(MsgType.Logon);
  });

  it("includes SenderCompID and TargetCompID", () => {
    const { session, sent } = makeSession();
    session.sendLogon();
    const tags = decode(sent[0]);
    expect(tags.get(Tag.SenderCompID)).toBe("TRADER");
    expect(tags.get(Tag.TargetCompID)).toBe("EXCHANGE");
  });

  it("increments outbound MsgSeqNum on each send", () => {
    const { session, sent } = makeSession();
    session.sendLogon();
    session.handleInbound(buildLogonMsg());

    // Force active so we can send NOS
    const order = makeOrder();
    session.sendNewOrderSingle(order);
    session.sendNewOrderSingle(makeOrder({ id: "order-002" }));

    const seq1 = Number(decode(sent[1]).get(Tag.MsgSeqNum));
    const seq2 = Number(decode(sent[2]).get(Tag.MsgSeqNum));
    expect(seq2).toBe(seq1 + 1);
  });

  it("resets sequence numbers when resetSeq=true", () => {
    const { session, sent } = makeSession();
    session.sendLogon();
    session.handleInbound(buildLogonMsg());
    session.sendLogout();

    // Reconnect with reset
    session.sendLogon(true);
    const tags = decode(sent[sent.length - 1]);
    expect(Number(tags.get(Tag.MsgSeqNum))).toBe(1);
  });
});

// ─── Outbound NewOrderSingle ──────────────────────────────────────────────────

describe("FIXSession – sendNewOrderSingle", () => {
  function activatedSession() {
    const ctx = makeSession();
    ctx.session.sendLogon();
    ctx.session.handleInbound(buildLogonMsg());
    ctx.sent.length = 0; // clear the Logon message
    return ctx;
  }

  it("sends a NewOrderSingle (35=D)", () => {
    const { session, sent } = activatedSession();
    session.sendNewOrderSingle(makeOrder());
    const tags = decode(sent[0]);
    expect(tags.get(Tag.MsgType)).toBe(MsgType.NewOrderSingle);
  });

  it("sets ClOrdID from order.id", () => {
    const { session, sent } = activatedSession();
    session.sendNewOrderSingle(makeOrder({ id: "my-order-42" }));
    const tags = decode(sent[0]);
    expect(tags.get(Tag.ClOrdID)).toBe("my-order-42");
  });

  it("sets Symbol from order.asset", () => {
    const { session, sent } = activatedSession();
    session.sendNewOrderSingle(makeOrder({ asset: "TSLA" }));
    const tags = decode(sent[0]);
    expect(tags.get(Tag.Symbol)).toBe("TSLA");
  });

  it("sets Side=1 for BUY", () => {
    const { session, sent } = activatedSession();
    session.sendNewOrderSingle(makeOrder({ side: "BUY" }));
    const tags = decode(sent[0]);
    expect(tags.get(Tag.Side)).toBe("1");
  });

  it("sets Side=2 for SELL", () => {
    const { session, sent } = activatedSession();
    session.sendNewOrderSingle(makeOrder({ side: "SELL" }));
    const tags = decode(sent[0]);
    expect(tags.get(Tag.Side)).toBe("2");
  });

  it("sets OrderQty and Price", () => {
    const { session, sent } = activatedSession();
    session.sendNewOrderSingle(makeOrder({ quantity: 250, limitPrice: 99.5 }));
    const tags = decode(sent[0]);
    expect(tags.get(Tag.OrderQty)).toBe("250");
    expect(tags.get(Tag.Price)).toBe("99.5");
  });
});

// ─── Inbound Heartbeat / TestRequest ─────────────────────────────────────────

describe("FIXSession – heartbeat handling", () => {
  function activatedSession() {
    const ctx = makeSession();
    ctx.session.sendLogon();
    ctx.session.handleInbound(buildLogonMsg());
    ctx.sent.length = 0;
    return ctx;
  }

  it("responds to TestRequest with a Heartbeat carrying the same TestReqID", () => {
    const { session, sent } = activatedSession();
    const testReq = buildExchangeMessage(
      [
        [Tag.MsgType, MsgType.TestRequest],
        [Tag.TestReqID, "TR-001"],
      ],
      2
    );
    session.handleInbound(testReq);
    const tags = decode(sent[0]);
    expect(tags.get(Tag.MsgType)).toBe(MsgType.Heartbeat);
    expect(tags.get(Tag.TestReqID)).toBe("TR-001");
  });

  it("Heartbeat with no TestReqID does not send a response", () => {
    const { session, sent } = activatedSession();
    const hb = buildExchangeMessage([[Tag.MsgType, MsgType.Heartbeat]], 2);
    session.handleInbound(hb);
    expect(sent).toHaveLength(0);
  });
});

// ─── Inbound SequenceReset ────────────────────────────────────────────────────

describe("FIXSession – SequenceReset", () => {
  function activatedSession() {
    const ctx = makeSession();
    ctx.session.sendLogon();
    ctx.session.handleInbound(buildLogonMsg());
    ctx.sent.length = 0;
    return ctx;
  }

  it("updates inbound expected sequence number", () => {
    const { session, sent } = activatedSession();
    const reset = buildExchangeMessage(
      [
        [Tag.MsgType, MsgType.SequenceReset],
        [Tag.NewSeqNo, 10],
      ],
      2
    );
    session.handleInbound(reset);
    // After reset to seq=10, next msg with seq=10 should be accepted (no ResendRequest)
    const hb = buildExchangeMessage([[Tag.MsgType, MsgType.Heartbeat]], 10);
    session.handleInbound(hb);
    expect(sent).toHaveLength(0); // no ResendRequest
  });
});

// ─── Inbound sequence gap → ResendRequest ────────────────────────────────────

describe("FIXSession – sequence gap", () => {
  it("sends ResendRequest when inbound seq > expected", () => {
    const { session, sent } = makeSession();
    session.sendLogon();
    session.handleInbound(buildLogonMsg(1));
    sent.length = 0;

    // Expected seq is 2, but we send seq=5 → gap
    const hb = buildExchangeMessage([[Tag.MsgType, MsgType.Heartbeat]], 5);
    session.handleInbound(hb);

    expect(sent).toHaveLength(1);
    const tags = decode(sent[0]);
    expect(tags.get(Tag.MsgType)).toBe(MsgType.ResendRequest);
    expect(tags.get(Tag.BeginSeqNo)).toBe("2");
    expect(tags.get(Tag.EndSeqNo)).toBe("4");
  });
});

// ─── Inbound ExecutionReport ──────────────────────────────────────────────────

describe("FIXSession – ExecutionReport", () => {
  function activatedSession() {
    const ctx = makeSession();
    ctx.session.sendLogon();
    ctx.session.handleInbound(buildLogonMsg());
    ctx.sent.length = 0;
    return ctx;
  }

  function buildExecReport(execType: string, seq: number) {
    return buildExchangeMessage(
      [
        [Tag.MsgType, MsgType.ExecutionReport],
        [Tag.ExecID, "exec-001"],
        [Tag.ExecType, execType],
        [Tag.OrdStatus, execType === "F" ? "2" : "1"],
        [Tag.ClOrdID, "order-001"],
        [Tag.OrderID, "ex-order-001"],
        [Tag.Symbol, "AAPL"],
        [Tag.Side, "1"],
        [Tag.CumQty, 50],
        [Tag.LeavesQty, execType === "F" ? 0 : 50],
        [Tag.AvgPx, 150.5],
        [Tag.LastQty, 50],
        [Tag.LastPx, 150.5],
      ],
      seq
    );
  }

  it("fires onExecReport for ExecType=F (Fill)", () => {
    const { session, execReports } = activatedSession();
    session.handleInbound(buildExecReport("F", 2));
    expect(execReports).toHaveLength(1);
    expect(execReports[0]).toMatchObject({
      clOrdId: "order-001",
      filledQty: 50,
      leavesQty: 0,
      avgFillPrice: 150.5,
    });
  });

  it("fires onExecReport for ExecType=1 (PartialFill)", () => {
    const { session, execReports } = activatedSession();
    session.handleInbound(buildExecReport("1", 2));
    expect(execReports).toHaveLength(1);
    expect(execReports[0]).toMatchObject({ clOrdId: "order-001", leavesQty: 50 });
  });

  it("does NOT fire onExecReport for ExecType=0 (New ack)", () => {
    const { session, execReports } = activatedSession();
    session.handleInbound(buildExecReport("0", 2));
    expect(execReports).toHaveLength(0);
  });

  it("does NOT fire onExecReport when session is not ACTIVE", () => {
    const { session, execReports } = makeSession();
    // DISCONNECTED state — feed ExecReport directly
    session.handleInbound(buildExecReport("F", 1));
    expect(execReports).toHaveLength(0);
  });
});

// ─── Heartbeat timer (fake timers) ───────────────────────────────────────────

describe("FIXSession – heartbeat timer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends TestRequest after one heartbeat interval", () => {
    const { session, sent } = makeSession({ heartBtInt: 5 }); // 5s HB
    session.sendLogon();
    session.handleInbound(buildLogonMsg(1, 5));
    sent.length = 0;

    vi.advanceTimersByTime(5_001);
    expect(sent).toHaveLength(1);
    expect(decode(sent[0]).get(Tag.MsgType)).toBe(MsgType.TestRequest);
  });

  it("disconnects if heartbeat is not answered by next tick", () => {
    const { session, sent } = makeSession({ heartBtInt: 5 });
    session.sendLogon();
    session.handleInbound(buildLogonMsg(1, 5));
    sent.length = 0;

    vi.advanceTimersByTime(5_001); // → sends TestRequest, sets testReqId
    vi.advanceTimersByTime(5_001); // → timer fires again, testReqId still set → disconnect
    expect(session.sessionState).toBe("DISCONNECTED");
  });

  it("clears testReqId when Heartbeat with matching TestReqID arrives", () => {
    const { session, sent } = makeSession({ heartBtInt: 5 });
    session.sendLogon();
    session.handleInbound(buildLogonMsg(1, 5));
    sent.length = 0;

    vi.advanceTimersByTime(5_001);
    // Extract the TestReqID from the sent TestRequest
    const testReqMsg = sent[sent.length - 1];
    const testReqId = decode(testReqMsg).get(Tag.TestReqID)!;

    // Exchange responds with Heartbeat carrying same TestReqID
    const hbReply = buildExchangeMessage(
      [
        [Tag.MsgType, MsgType.Heartbeat],
        [Tag.TestReqID, testReqId],
      ],
      2
    );
    session.handleInbound(hbReply);

    // Next heartbeat tick should NOT disconnect
    vi.advanceTimersByTime(5_001);
    expect(session.sessionState).toBe("ACTIVE");
  });
});

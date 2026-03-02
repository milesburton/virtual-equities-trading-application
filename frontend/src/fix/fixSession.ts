// Browser-side FIXT 1.1 / FIX 4.4 session.
// Manages sequence numbers, heartbeats, Logon/Logout, and message building.
// Mirrors backend/src/fix/fixSession.ts — same protocol, browser-compatible.

import type { OrderRecord } from "../types.ts";
import {
  decode,
  EncryptMethod,
  ExecType,
  encode,
  MsgType,
  OrdType,
  Side,
  Tag,
  utcTimestamp,
} from "./fixCodec.ts";

export type SessionState = "DISCONNECTED" | "LOGON_SENT" | "ACTIVE" | "LOGOUT_SENT";

export interface ExecReportPayload {
  clOrdId: string;
  orderId: string;
  execType: string;
  ordStatus: string;
  filledQty: number;
  leavesQty: number;
  avgFillPrice: number;
  lastQty: number;
  lastPx: number;
  symbol: string;
  side: string;
}

export interface SessionConfig {
  senderCompID: string;
  targetCompID: string;
  heartBtInt?: number;
  onSend: (msg: string) => void;
  onExecReport?: (report: ExecReportPayload) => void;
  onStateChange?: (state: SessionState) => void;
}

export class FIXSession {
  private state: SessionState = "DISCONNECTED";
  private outSeq = 1;
  private inSeq = 1;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private testReqId: string | null = null;
  private readonly config: Required<SessionConfig>;

  constructor(config: SessionConfig) {
    this.config = {
      heartBtInt: 30,
      onExecReport: () => {},
      onStateChange: () => {},
      ...config,
    };
  }

  get sessionState(): SessionState {
    return this.state;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  sendLogon(resetSeq = false): void {
    if (resetSeq) {
      this.outSeq = 1;
      this.inSeq = 1;
    }
    const msg = this.buildMessage([
      [Tag.MsgType, MsgType.Logon],
      [Tag.EncryptMethod, EncryptMethod.None],
      [Tag.HeartBtInt, this.config.heartBtInt],
    ]);
    this.config.onSend(msg);
    this.setState("LOGON_SENT");
  }

  sendLogout(text = "Normal logout"): void {
    const msg = this.buildMessage([
      [Tag.MsgType, MsgType.Logout],
      [Tag.Text, text],
    ]);
    this.config.onSend(msg);
    this.setState("LOGOUT_SENT");
    this.stopHeartbeat();
  }

  sendNewOrderSingle(order: OrderRecord): void {
    const side = order.side === "SELL" ? Side.Sell : Side.Buy;
    const msg = this.buildMessage([
      [Tag.MsgType, MsgType.NewOrderSingle],
      [Tag.ClOrdID, order.id],
      [Tag.HandlInst, "1"], // automated
      [Tag.Symbol, order.asset],
      [Tag.Side, side],
      [Tag.TransactTime, utcTimestamp()],
      [Tag.OrderQty, order.quantity],
      [Tag.OrdType, OrdType.Limit],
      [Tag.Price, order.limitPrice],
    ]);
    this.config.onSend(msg);
  }

  handleInbound(raw: string): void {
    const tags = decode(raw);
    const msgType = tags.get(Tag.MsgType);
    const senderSeq = Number(tags.get(Tag.MsgSeqNum) ?? "0");

    if (!msgType) return;

    if (senderSeq > this.inSeq) {
      this.sendResendRequest(this.inSeq, senderSeq - 1);
      return;
    }
    this.inSeq = senderSeq + 1;

    switch (msgType) {
      case MsgType.Logon:
        this.onLogon(tags);
        break;
      case MsgType.Logout:
        this.onLogout();
        break;
      case MsgType.Heartbeat:
        this.onHeartbeat(tags);
        break;
      case MsgType.TestRequest:
        this.onTestRequest(tags);
        break;
      case MsgType.SequenceReset:
        this.onSequenceReset(tags);
        break;
      case MsgType.ExecutionReport:
        if (this.state === "ACTIVE") this.onExecReport(tags);
        break;
    }
  }

  disconnect(): void {
    this.stopHeartbeat();
    this.setState("DISCONNECTED");
  }

  // ─── Private handlers ────────────────────────────────────────────────────────

  private onLogon(tags: Map<number, string>): void {
    const heartBtInt = Number(tags.get(Tag.HeartBtInt) ?? this.config.heartBtInt);
    if (this.state === "LOGON_SENT") {
      this.setState("ACTIVE");
      this.startHeartbeat(heartBtInt);
    }
  }

  private onLogout(): void {
    if (this.state !== "LOGOUT_SENT") {
      const msg = this.buildMessage([
        [Tag.MsgType, MsgType.Logout],
        [Tag.Text, "Logout acknowledged"],
      ]);
      this.config.onSend(msg);
    }
    this.stopHeartbeat();
    this.setState("DISCONNECTED");
  }

  private onHeartbeat(tags: Map<number, string>): void {
    const testReqId = tags.get(Tag.TestReqID);
    if (testReqId && testReqId === this.testReqId) {
      this.testReqId = null;
    }
  }

  private onTestRequest(tags: Map<number, string>): void {
    const testReqId = tags.get(Tag.TestReqID) ?? "";
    const hb = this.buildMessage([
      [Tag.MsgType, MsgType.Heartbeat],
      [Tag.TestReqID, testReqId],
    ]);
    this.config.onSend(hb);
  }

  private onSequenceReset(tags: Map<number, string>): void {
    const newSeqNo = Number(tags.get(Tag.NewSeqNo) ?? "0");
    if (newSeqNo > 0) this.inSeq = newSeqNo;
  }

  private onExecReport(tags: Map<number, string>): void {
    const execType = tags.get(Tag.ExecType) ?? "";
    if (execType !== ExecType.PartialFill && execType !== ExecType.Fill) return;

    const report: ExecReportPayload = {
      clOrdId: tags.get(Tag.ClOrdID) ?? "",
      orderId: tags.get(Tag.OrderID) ?? "",
      execType,
      ordStatus: tags.get(Tag.OrdStatus) ?? "",
      filledQty: Number(tags.get(Tag.CumQty) ?? "0"),
      leavesQty: Number(tags.get(Tag.LeavesQty) ?? "0"),
      avgFillPrice: Number(tags.get(Tag.AvgPx) ?? "0"),
      lastQty: Number(tags.get(Tag.LastQty) ?? "0"),
      lastPx: Number(tags.get(Tag.LastPx) ?? "0"),
      symbol: tags.get(Tag.Symbol) ?? "",
      side: tags.get(Tag.Side) ?? "",
    };

    this.config.onExecReport(report);
  }

  private sendResendRequest(begin: number, end: number): void {
    const req = this.buildMessage([
      [Tag.MsgType, MsgType.ResendRequest],
      [Tag.BeginSeqNo, begin],
      [Tag.EndSeqNo, end],
    ]);
    this.config.onSend(req);
  }

  // ─── Heartbeat ───────────────────────────────────────────────────────────────

  private startHeartbeat(intervalSecs: number): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.state !== "ACTIVE") return;
      if (this.testReqId) {
        console.warn("[FIX] Heartbeat timeout — disconnecting");
        this.disconnect();
        return;
      }
      this.testReqId = String(Date.now());
      const testReq = this.buildMessage([
        [Tag.MsgType, MsgType.TestRequest],
        [Tag.TestReqID, this.testReqId],
      ]);
      this.config.onSend(testReq);
    }, intervalSecs * 1_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ─── Message builder ─────────────────────────────────────────────────────────

  private buildMessage(bodyTags: [number, string | number][]): string {
    const seq = this.outSeq++;
    const fullTags: [number, string | number][] = [
      ...bodyTags.slice(0, 1), // MsgType first
      [Tag.SenderCompID, this.config.senderCompID],
      [Tag.TargetCompID, this.config.targetCompID],
      [Tag.MsgSeqNum, seq],
      [Tag.SendingTime, utcTimestamp()],
      ...bodyTags.slice(1),
    ];
    return encode(fullTags);
  }

  private setState(s: SessionState): void {
    this.state = s;
    this.config.onStateChange(s);
  }
}

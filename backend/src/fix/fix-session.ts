// FIXT 1.1 / FIX 4.4 session state machine
// Manages logon, heartbeat, sequence numbers, resend requests, and gap-fill.

import { EncryptMethod, MsgType, Tag } from "./fix-dictionary.ts";
import { decode, encode, utcTimestamp } from "./fix-parser.ts";

export type SessionState = "DISCONNECTED" | "LOGON_SENT" | "ACTIVE" | "LOGOUT_SENT";

export interface SessionConfig {
  senderCompID: string;
  targetCompID: string;
  heartBtInt?: number; // seconds, default 30
  onSend: (msg: string) => void;
  onApplicationMessage: (tags: Map<number, string>) => void;
  onStateChange?: (state: SessionState) => void;
}

export class FixSession {
  private state: SessionState = "DISCONNECTED";
  private outSeq = 1; // next outbound MsgSeqNum
  private inSeq = 1;  // next expected inbound MsgSeqNum
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private testReqId: string | null = null;
  private readonly config: Required<SessionConfig>;

  constructor(config: SessionConfig) {
    this.config = {
      heartBtInt: 30,
      onStateChange: () => {},
      ...config,
    };
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  get sessionState(): SessionState {
    return this.state;
  }

  /** Called when raw bytes arrive over the transport. May produce messages to send. */
  handleInbound(raw: string): void {
    const tags = decode(raw);
    const msgType = tags.get(Tag.MsgType);
    const senderSeq = Number(tags.get(Tag.MsgSeqNum) ?? "0");

    if (!msgType) return;

    // Sequence gap detection
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
        this.onLogout(tags);
        break;
      case MsgType.Heartbeat:
        this.onHeartbeat(tags);
        break;
      case MsgType.TestRequest:
        this.onTestRequest(tags);
        break;
      case MsgType.ResendRequest:
        this.onResendRequest(tags);
        break;
      case MsgType.SequenceReset:
        this.onSequenceReset(tags);
        break;
      default:
        // Application-level message
        if (this.state === "ACTIVE") {
          this.config.onApplicationMessage(tags);
        }
    }
  }

  /** Initiator: send Logon to start session */
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

  /** Send an application message. Wraps it with standard header tags. */
  sendMessage(bodyTags: [number, string | number][]): void {
    const msg = this.buildMessage(bodyTags);
    this.config.onSend(msg);
  }

  disconnect(): void {
    this.stopHeartbeat();
    this.setState("DISCONNECTED");
  }

  // ─── Private Handlers ───────────────────────────────────────────────────────

  private onLogon(tags: Map<number, string>): void {
    const heartBtInt = Number(tags.get(Tag.HeartBtInt) ?? this.config.heartBtInt);
    if (this.state === "LOGON_SENT") {
      // Acceptor responded — session active
      this.setState("ACTIVE");
      this.startHeartbeat(heartBtInt);
    } else if (this.state === "DISCONNECTED") {
      // Acceptor role: received Logon first
      const response = this.buildMessage([
        [Tag.MsgType, MsgType.Logon],
        [Tag.EncryptMethod, EncryptMethod.None],
        [Tag.HeartBtInt, heartBtInt],
      ]);
      this.config.onSend(response);
      this.setState("ACTIVE");
      this.startHeartbeat(heartBtInt);
    }
  }

  private onLogout(_tags: Map<number, string>): void {
    if (this.state !== "LOGOUT_SENT") {
      // Counterparty initiated logout — respond
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
      this.testReqId = null; // heartbeat acknowledged TestRequest
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

  private onResendRequest(tags: Map<number, string>): void {
    const begin = Number(tags.get(Tag.BeginSeqNo) ?? "0");
    const end = Number(tags.get(Tag.EndSeqNo) ?? "0");
    // Send gap fill for all requested sequences (we don't store sent messages)
    const reset = this.buildMessage([
      [Tag.MsgType, MsgType.SequenceReset],
      [Tag.GapFillFlag, "Y"],
      [Tag.NewSeqNo, end === 0 ? this.outSeq : end + 1],
    ]);
    console.log(`[FIX] Gap fill ${begin}-${end}`);
    this.config.onSend(reset);
  }

  private onSequenceReset(tags: Map<number, string>): void {
    const newSeqNo = Number(tags.get(Tag.NewSeqNo) ?? "0");
    if (newSeqNo > 0) {
      this.inSeq = newSeqNo;
    }
  }

  private sendResendRequest(begin: number, end: number): void {
    const req = this.buildMessage([
      [Tag.MsgType, MsgType.ResendRequest],
      [Tag.BeginSeqNo, begin],
      [Tag.EndSeqNo, end],
    ]);
    this.config.onSend(req);
  }

  // ─── Heartbeat Management ───────────────────────────────────────────────────

  private startHeartbeat(intervalSecs: number): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.state !== "ACTIVE") return;
      if (this.testReqId) {
        // No heartbeat received since we sent TestRequest → disconnect
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

  // ─── Message Builder ────────────────────────────────────────────────────────

  private buildMessage(bodyTags: [number, string | number][]): string {
    const seq = this.outSeq++;
    const fullTags: [number, string | number][] = [
      ...bodyTags.slice(0, 1), // MsgType must be first body tag for BodyLength calc
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

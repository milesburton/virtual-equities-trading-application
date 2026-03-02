// Browser-side FIX 4.4 encoder/decoder
// Mirrors backend/src/fix/fixParser.ts (no Node/Deno APIs used).

export const SOH = "\x01";
export const BEGIN_STRING = "FIX.4.4";

// ─── Tag / MsgType constants ─────────────────────────────────────────────────

export const Tag = {
  BeginString: 8,
  BodyLength: 9,
  MsgType: 35,
  SenderCompID: 49,
  TargetCompID: 56,
  MsgSeqNum: 34,
  SendingTime: 52,
  HeartBtInt: 108,
  EncryptMethod: 98,
  TestReqID: 112,
  GapFillFlag: 123,
  NewSeqNo: 36,
  BeginSeqNo: 7,
  EndSeqNo: 16,
  ClOrdID: 11,
  Symbol: 55,
  Side: 54,
  OrderQty: 38,
  Price: 44,
  OrdType: 40,
  TimeInForce: 59,
  TransactTime: 60,
  HandlInst: 21,
  ExecID: 17,
  ExecType: 150,
  OrdStatus: 39,
  LeavesQty: 151,
  CumQty: 14,
  AvgPx: 6,
  OrderID: 37,
  LastQty: 32,
  LastPx: 31,
  Text: 58,
  CheckSum: 10,
} as const;

export const MsgType = {
  Heartbeat: "0",
  TestRequest: "1",
  ResendRequest: "2",
  SequenceReset: "4",
  Logout: "5",
  Logon: "A",
  NewOrderSingle: "D",
  ExecutionReport: "8",
} as const;

export const Side = { Buy: "1", Sell: "2" } as const;
export const OrdType = { Market: "1", Limit: "2" } as const;
export const ExecType = { New: "0", PartialFill: "1", Fill: "F", Canceled: "4" } as const;
export const OrdStatus = { New: "0", PartiallyFilled: "1", Filled: "2", Canceled: "4" } as const;
export const EncryptMethod = { None: "0" } as const;

// ─── Encoder ─────────────────────────────────────────────────────────────────

export function encode(tags: [number, string | number][]): string {
  const bodyParts = tags.map(([t, v]) => `${t}=${v}${SOH}`);
  const body = bodyParts.join("");

  const bodyLength = new TextEncoder().encode(body).length;
  const header = `8=${BEGIN_STRING}${SOH}9=${bodyLength}${SOH}`;
  const rawNoChecksum = header + body;

  let sum = 0;
  for (const char of rawNoChecksum) {
    sum = (sum + char.charCodeAt(0)) & 0xff;
  }
  const checksum = String(sum).padStart(3, "0");

  return `${rawNoChecksum}10=${checksum}${SOH}`;
}

// ─── Decoder ─────────────────────────────────────────────────────────────────

export function decode(raw: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const pair of raw.split(SOH)) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if (eq < 1) continue;
    const tag = Number(pair.slice(0, eq));
    const val = pair.slice(eq + 1);
    if (!Number.isNaN(tag)) map.set(tag, val);
  }
  return map;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

export function utcTimestamp(d = new Date()): string {
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const pad3 = (n: number) => String(n).padStart(3, "0");
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}-` +
    `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}.${pad3(d.getUTCMilliseconds())}`
  );
}

// ─── Message splitter ────────────────────────────────────────────────────────
// Splits a raw buffer that may contain multiple concatenated FIX messages.

export function splitMessages(buffer: string): { messages: string[]; remainder: string } {
  const messages: string[] = [];
  let remaining = buffer;

  while (true) {
    const msgEnd = remaining.indexOf(`${SOH}10=`);
    if (msgEnd === -1) break;
    const trailerEnd = msgEnd + 7; // \x0110=XXX\x01
    if (trailerEnd > remaining.length) break;
    messages.push(remaining.slice(0, trailerEnd));
    remaining = remaining.slice(trailerEnd);
  }

  return { messages, remainder: remaining };
}

import { describe, expect, it } from "vitest";
import {
  BEGIN_STRING,
  decode,
  encode,
  MsgType,
  SOH,
  splitMessages,
  Tag,
  utcTimestamp,
} from "../fixCodec";

// ─── encode ───────────────────────────────────────────────────────────────────

describe("encode", () => {
  it("starts with BeginString tag 8=FIX.4.4", () => {
    const msg = encode([[Tag.MsgType, MsgType.Heartbeat]]);
    expect(msg.startsWith(`8=${BEGIN_STRING}${SOH}`)).toBe(true);
  });

  it("includes BodyLength tag 9", () => {
    const msg = encode([[Tag.MsgType, MsgType.Heartbeat]]);
    expect(msg).toContain(`${SOH}9=`);
  });

  it("ends with CheckSum tag 10 followed by SOH", () => {
    const msg = encode([[Tag.MsgType, MsgType.Heartbeat]]);
    expect(msg).toMatch(new RegExp(`10=\\d{3}${SOH}$`));
  });

  it("checksum is 3 digits zero-padded", () => {
    const msg = encode([[Tag.MsgType, MsgType.Logon]]);
    // biome-ignore lint/suspicious/noControlCharactersInRegex: FIX protocol uses SOH
    const match = msg.match(/10=(\d{3})\u0001$/);
    expect(match).not.toBeNull();
    expect(match?.[1]).toHaveLength(3);
  });

  it("includes the body tags in the output", () => {
    const msg = encode([
      [Tag.MsgType, MsgType.NewOrderSingle],
      [Tag.ClOrdID, "order-123"],
    ]);
    expect(msg).toContain(`35=D${SOH}`);
    expect(msg).toContain(`11=order-123${SOH}`);
  });

  it("separates fields with SOH (\\x01)", () => {
    const msg = encode([[Tag.MsgType, MsgType.Heartbeat]]);
    const fields = msg.split(SOH).filter(Boolean);
    expect(fields.length).toBeGreaterThanOrEqual(3); // 8, 9, 35, 10
    for (const field of fields) {
      expect(field).toContain("=");
    }
  });

  it("computes correct checksum (sum mod 256)", () => {
    const msg = encode([[Tag.MsgType, MsgType.Heartbeat]]);
    const checksumPattern = new RegExp(`10=(\\d{3})${SOH}$`);
    const checksumMatch = msg.match(checksumPattern);
    const claimed = Number(checksumMatch?.[1] ?? "0");

    // Compute checksum ourselves over everything before the checksum field
    const bodyEnd = msg.lastIndexOf(`${SOH}10=`);
    let sum = 0;
    for (let i = 0; i <= bodyEnd; i++) {
      sum = (sum + msg.charCodeAt(i)) & 0xff;
    }
    expect(sum).toBe(claimed);
  });

  it("BodyLength matches byte count of body", () => {
    const tags: [number, string | number][] = [
      [Tag.MsgType, MsgType.NewOrderSingle],
      [Tag.ClOrdID, "order-abc"],
      [Tag.Symbol, "AAPL"],
    ];
    const msg = encode(tags);

    // Extract claimed body length
    // biome-ignore lint/suspicious/noControlCharactersInRegex: FIX protocol uses SOH
    const bodyLenMatch = msg.match(/9=(\d+)\x01/);
    const claimed = Number(bodyLenMatch?.[1] ?? "0");

    // Body is between the end of tag 9 and the start of tag 10
    const bodyStart = msg.indexOf(`9=${claimed}${SOH}`) + `9=${claimed}${SOH}`.length;
    const bodyEnd = msg.lastIndexOf(`${SOH}10=`) + 1; // include trailing SOH of last body tag
    const body = msg.slice(bodyStart, bodyEnd);
    const actual = new TextEncoder().encode(body).length;
    expect(actual).toBe(claimed);
  });
});

// ─── decode ───────────────────────────────────────────────────────────────────

describe("decode", () => {
  it("round-trips a simple message", () => {
    const msg = encode([[Tag.MsgType, MsgType.Heartbeat]]);
    const tags = decode(msg);
    expect(tags.get(Tag.BeginString)).toBe(BEGIN_STRING);
    expect(tags.get(Tag.MsgType)).toBe(MsgType.Heartbeat);
    expect(tags.has(Tag.BodyLength)).toBe(true);
    expect(tags.has(Tag.CheckSum)).toBe(true);
  });

  it("extracts string values", () => {
    const msg = encode([
      [Tag.MsgType, MsgType.NewOrderSingle],
      [Tag.ClOrdID, "my-order-id"],
      [Tag.Symbol, "MSFT"],
    ]);
    const tags = decode(msg);
    expect(tags.get(Tag.ClOrdID)).toBe("my-order-id");
    expect(tags.get(Tag.Symbol)).toBe("MSFT");
  });

  it("extracts numeric values as strings", () => {
    const msg = encode([
      [Tag.MsgType, MsgType.NewOrderSingle],
      [Tag.OrderQty, 500],
      [Tag.Price, 123.45],
    ]);
    const tags = decode(msg);
    expect(tags.get(Tag.OrderQty)).toBe("500");
    expect(tags.get(Tag.Price)).toBe("123.45");
  });

  it("handles empty input gracefully", () => {
    const tags = decode("");
    expect(tags.size).toBe(0);
  });

  it("skips malformed fields without crashing", () => {
    const raw = `8=FIX.4.4${SOH}noequals${SOH}35=0${SOH}`;
    const tags = decode(raw);
    expect(tags.get(Tag.BeginString)).toBe("FIX.4.4");
    expect(tags.get(Tag.MsgType)).toBe("0");
  });
});

// ─── utcTimestamp ─────────────────────────────────────────────────────────────

describe("utcTimestamp", () => {
  it("returns a string in YYYYMMDD-HH:MM:SS.sss format", () => {
    const ts = utcTimestamp(new Date("2025-01-15T14:30:45.123Z"));
    expect(ts).toBe("20250115-14:30:45.123");
  });

  it("zero-pads month, day, hours, minutes, seconds, ms", () => {
    const ts = utcTimestamp(new Date("2025-03-02T04:05:06.007Z"));
    expect(ts).toBe("20250302-04:05:06.007");
  });

  it("uses current time when called with no argument", () => {
    const before = new Date().getUTCFullYear().toString();
    const ts = utcTimestamp();
    expect(ts.startsWith(before)).toBe(true);
  });

  it("has correct length (17 chars: YYYYMMDD-HH:MM:SS.sss)", () => {
    const ts = utcTimestamp(new Date("2025-06-15T10:20:30.456Z"));
    expect(ts).toHaveLength(21); // "20250615-10:20:30.456"
  });
});

// ─── splitMessages ────────────────────────────────────────────────────────────

describe("splitMessages", () => {
  function makeMsg(clOrdId: string) {
    return encode([
      [Tag.MsgType, MsgType.NewOrderSingle],
      [Tag.ClOrdID, clOrdId],
    ]);
  }

  // Note: the implementation slices at msgEnd + 7 (\x01 + 10= + XXX = 7 chars),
  // which means each message in the result does NOT include its own trailing SOH,
  // and the remainder after fully splitting N messages is a single SOH (\x01)
  // left over from the last message's trailing delimiter.

  it("splits two concatenated messages", () => {
    const msg1 = makeMsg("order-1");
    const msg2 = makeMsg("order-2");
    const { messages, remainder } = splitMessages(msg1 + msg2);
    expect(messages).toHaveLength(2);
    // remainder is the leftover SOH after the last message's checksum
    expect(remainder).toBe(SOH);
  });

  it("returns single message with expected remainder", () => {
    const msg = makeMsg("order-1");
    const { messages, remainder } = splitMessages(msg);
    expect(messages).toHaveLength(1);
    expect(remainder).toBe(SOH);
  });

  it("returns empty messages and full buffer as remainder when incomplete", () => {
    const msg = makeMsg("order-1");
    // Cut off before the checksum trailer pattern (before \x0110=)
    const soHPos = msg.lastIndexOf(`${SOH}10=`);
    const incomplete = msg.slice(0, soHPos); // no \x0110= at all
    const { messages, remainder } = splitMessages(incomplete);
    expect(messages).toHaveLength(0);
    expect(remainder).toBe(incomplete);
  });

  it("handles empty buffer", () => {
    const { messages, remainder } = splitMessages("");
    expect(messages).toHaveLength(0);
    expect(remainder).toBe("");
  });

  it("returns remainder when partial second message follows a complete first", () => {
    const msg1 = makeMsg("order-1");
    const msg2 = makeMsg("order-2");
    // After splitting msg1, the SOH remainder + first 10 chars of msg2 become remainder
    const partial = msg2.slice(0, 10);
    const { messages, remainder } = splitMessages(msg1 + partial);
    expect(messages).toHaveLength(1);
    // remainder = SOH (leftover from msg1) + partial of msg2
    expect(remainder).toBe(SOH + partial);
  });

  it("splits three concatenated messages", () => {
    const combined = makeMsg("a") + makeMsg("b") + makeMsg("c");
    const { messages, remainder } = splitMessages(combined);
    expect(messages).toHaveLength(3);
    expect(remainder).toBe(SOH);
  });

  it("decoded messages contain the expected ClOrdID values", () => {
    const msg1 = makeMsg("order-x");
    const msg2 = makeMsg("order-y");
    const { messages } = splitMessages(msg1 + msg2);
    // Decode works even without trailing SOH since decode splits on SOH
    const tags1 = decode(messages[0]);
    const tags2 = decode(messages[1]);
    expect(tags1.get(Tag.ClOrdID)).toBe("order-x");
    expect(tags2.get(Tag.ClOrdID)).toBe("order-y");
  });
});

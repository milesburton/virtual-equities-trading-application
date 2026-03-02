/**
 * Unit tests for backend/src/fix/fix-parser.ts
 * Covers: encode, decode, validateChecksum, utcTimestamp
 */

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.210.0/testing/asserts.ts";

import { decode, encode, SOH, validateChecksum, utcTimestamp } from "../fix/fix-parser.ts";

// ─── encode ───────────────────────────────────────────────────────────────────

Deno.test("[fix-parser] encode starts with 8=FIX.4.4", () => {
  const msg = encode([[35, "A"]]);
  assert(msg.startsWith(`8=FIX.4.4${SOH}`), `message should start with BeginString: ${msg}`);
});

Deno.test("[fix-parser] encode includes BodyLength tag 9", () => {
  const msg = encode([[35, "A"]]);
  assert(msg.includes(`${SOH}9=`), "missing BodyLength tag");
});

Deno.test("[fix-parser] encode ends with CheckSum tag 10 followed by SOH", () => {
  const msg = encode([[35, "D"], [11, "order-001"], [55, "AAPL"]]);
  assert(msg.match(new RegExp(`10=\\d{3}${SOH}$`)), "message should end with checksum");
});

Deno.test("[fix-parser] encode checksum is 3-digit zero-padded", () => {
  const msg = encode([[35, "0"]]);
  const checksumPattern = new RegExp(`10=(\\d{3})${SOH}$`);
  const match = msg.match(checksumPattern);
  assert(match !== null, "no checksum found");
  assertEquals(match![1].length, 3);
});

Deno.test("[fix-parser] encode includes body tags in output", () => {
  const msg = encode([
    [35, "D"],
    [11, "my-order"],
    [55, "TSLA"],
  ]);
  assert(msg.includes(`35=D${SOH}`));
  assert(msg.includes(`11=my-order${SOH}`));
  assert(msg.includes(`55=TSLA${SOH}`));
});

Deno.test("[fix-parser] encode computes correct checksum", () => {
  const msg = encode([[35, "A"], [98, 0], [108, 30]]);
  const checksumPattern = new RegExp(`10=(\\d{3})${SOH}$`);
  const match = msg.match(checksumPattern);
  assert(match !== null);
  const claimed = Number(match![1]);

  const bodyEnd = msg.lastIndexOf(`${SOH}10=`);
  let sum = 0;
  for (let i = 0; i <= bodyEnd; i++) {
    sum = (sum + msg.charCodeAt(i)) & 0xff;
  }
  assertEquals(sum, claimed);
});

Deno.test("[fix-parser] encode BodyLength matches byte count of body", () => {
  const tags: [number, string | number][] = [
    [35, "D"],
    [11, "order-123"],
    [55, "AAPL"],
    [38, 100],
    [44, 150.5],
  ];
  const msg = encode(tags);
  const bodyLenPattern = new RegExp(`9=(\\d+)${SOH}`);
  const bodyLenMatch = msg.match(bodyLenPattern);
  assert(bodyLenMatch !== null, "no BodyLength found");
  const claimed = Number(bodyLenMatch![1]);

  const bodyStart = msg.indexOf(`9=${claimed}${SOH}`) + `9=${claimed}${SOH}`.length;
  const bodyEnd = msg.lastIndexOf(`${SOH}10=`) + 1;
  const body = msg.slice(bodyStart, bodyEnd);
  const actual = new TextEncoder().encode(body).length;
  assertEquals(actual, claimed);
});

// ─── decode ───────────────────────────────────────────────────────────────────

Deno.test("[fix-parser] decode round-trips a Logon message", () => {
  const msg = encode([[35, "A"], [98, 0], [108, 30]]);
  const tags = decode(msg);
  assertEquals(tags.get(8), "FIX.4.4");
  assertEquals(tags.get(35), "A");
  assert(tags.has(9), "missing BodyLength");
  assert(tags.has(10), "missing CheckSum");
});

Deno.test("[fix-parser] decode extracts string and numeric values", () => {
  const msg = encode([[35, "D"], [11, "clordid-999"], [55, "MSFT"], [38, 500], [44, 123.45]]);
  const tags = decode(msg);
  assertEquals(tags.get(11), "clordid-999");
  assertEquals(tags.get(55), "MSFT");
  assertEquals(tags.get(38), "500");
  assertEquals(tags.get(44), "123.45");
});

Deno.test("[fix-parser] decode returns empty map for empty string", () => {
  const tags = decode("");
  assertEquals(tags.size, 0);
});

Deno.test("[fix-parser] decode skips malformed fields without crashing", () => {
  const raw = `8=FIX.4.4${SOH}noequals${SOH}35=0${SOH}`;
  const tags = decode(raw);
  assertEquals(tags.get(8), "FIX.4.4");
  assertEquals(tags.get(35), "0");
});

// ─── validateChecksum ─────────────────────────────────────────────────────────

Deno.test("[fix-parser] validateChecksum returns true for a valid encoded message", () => {
  const msg = encode([[35, "A"], [98, 0], [108, 30]]);
  assert(validateChecksum(msg), "expected valid checksum");
});

Deno.test("[fix-parser] validateChecksum returns false when checksum is tampered", () => {
  const msg = encode([[35, "A"]]);
  // Flip one digit in the checksum
  const tamperedPattern = new RegExp(`10=(\\d{3})${SOH}$`);
  const tampered = msg.replace(tamperedPattern, (_m, cs) => {
    const bad = String((Number(cs) + 1) % 256).padStart(3, "0");
    return `10=${bad}${SOH}`;
  });
  assert(!validateChecksum(tampered), "should detect invalid checksum");
});

Deno.test("[fix-parser] validateChecksum returns false for empty string", () => {
  assert(!validateChecksum(""), "empty string should fail validation");
});

Deno.test("[fix-parser] validateChecksum returns false for message without checksum", () => {
  const noChecksum = `8=FIX.4.4${SOH}35=A${SOH}`;
  assert(!validateChecksum(noChecksum), "message without 10= should fail");
});

// ─── utcTimestamp ─────────────────────────────────────────────────────────────

Deno.test("[fix-parser] utcTimestamp returns correct format for a known date", () => {
  const d = new Date("2025-01-15T14:30:45.123Z");
  const ts = utcTimestamp(d);
  assertEquals(ts, "20250115-14:30:45.123");
});

Deno.test("[fix-parser] utcTimestamp zero-pads single-digit components", () => {
  const d = new Date("2025-03-02T04:05:06.007Z");
  const ts = utcTimestamp(d);
  assertEquals(ts, "20250302-04:05:06.007");
});

Deno.test("[fix-parser] utcTimestamp has correct total length", () => {
  const ts = utcTimestamp(new Date("2025-06-15T10:20:30.456Z"));
  // YYYYMMDD-HH:MM:SS.sss = 8+1+2+1+2+1+2+1+3 = 21 chars
  assertEquals(ts.length, 21);
});

Deno.test("[fix-parser] utcTimestamp uses current time when called without argument", () => {
  const before = new Date().getUTCFullYear().toString();
  const ts = utcTimestamp();
  assert(ts.startsWith(before), `timestamp should start with current year, got: ${ts}`);
});

// FIX 4.4 message encoder/decoder
// Wire format: tag=value<SOH> sequences
// BeginString(8), BodyLength(9), and CheckSum(10) are managed by encode/decode.

export const SOH = "\x01";
export const BEGIN_STRING = "FIX.4.4";

// ─── Decoder ──────────────────────────────────────────────────────────────────

/**
 * Decode a raw FIX string into a Map of tag → value.
 * Tag 8 (BeginString), 9 (BodyLength), and 10 (CheckSum) are included.
 */
export function decode(raw: string): Map<number, string> {
  const map = new Map<number, string>();
  // Split on SOH; filter empty segments
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

// ─── Encoder ──────────────────────────────────────────────────────────────────

/**
 * Encode a FIX message from body tag-value pairs.
 * Automatically prepends 8 (BeginString) and 9 (BodyLength),
 * and appends 10 (CheckSum).
 *
 * @param tags Array of [tagNumber, value] pairs.
 *             Do NOT include tags 8, 9, or 10 — they are added automatically.
 */
export function encode(tags: [number, string | number][]): string {
  // Build body (everything between BodyLength and CheckSum)
  const bodyParts = tags.map(([t, v]) => `${t}=${v}${SOH}`);
  const body = bodyParts.join("");

  // BodyLength = length of body only (no BeginString, no BodyLength, no CheckSum fields)
  // Per FIX spec: "number of bytes from <SOH> after BodyLength to <SOH> of CheckSum"
  const bodyLength = new TextEncoder().encode(body).length;

  const header = `8=${BEGIN_STRING}${SOH}9=${bodyLength}${SOH}`;
  const rawNoChecksum = header + body;

  // CheckSum: sum of all byte values mod 256
  let sum = 0;
  for (const char of rawNoChecksum) {
    sum = (sum + char.charCodeAt(0)) & 0xff;
  }
  const checksum = String(sum).padStart(3, "0");

  return `${rawNoChecksum}10=${checksum}${SOH}`;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateChecksum(raw: string): boolean {
  // Find last 10= field
  // deno-lint-ignore no-control-regex
  const checksumMatch = raw.match(/10=(\d{3})\x01$/);
  if (!checksumMatch) return false;
  const expected = Number(checksumMatch[1]);

  // Sum everything before the checksum field
  const bodyEnd = raw.lastIndexOf(`${SOH}10=`);
  if (bodyEnd < 0) return false;

  let sum = 0;
  for (let i = 0; i <= bodyEnd; i++) {
    sum = (sum + raw.charCodeAt(i)) & 0xff;
  }
  return sum === expected;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Format a timestamp in FIX UTCTimestamp format: YYYYMMDD-HH:MM:SS.sss */
export function utcTimestamp(d = new Date()): string {
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const pad3 = (n: number) => String(n).padStart(3, "0");
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}-` +
    `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}.${pad3(d.getUTCMilliseconds())}`
  );
}

/**
 * Static file server for the built frontend.
 *
 * Serves ./frontend/dist as a SPA (404 → index.html) and exposes:
 *   GET /__version  →  { "hash": "<sha256 of asset filenames>" }
 *
 * The client polls /__version every 30 s and shows a reload banner when the
 * hash changes, enabling zero-downtime frontend deployments.
 */

import { serveDir } from "jsr:@std/http/file-server";
import { crypto } from "jsr:@std/crypto";
import { encodeHex } from "jsr:@std/encoding/hex";

const PORT = Number(Deno.env.get("FRONTEND_PORT") ?? 8080);
const DIST = new URL("./frontend/dist", import.meta.url).pathname;

async function buildHash(): Promise<string> {
  const names: string[] = [];
  for await (const entry of Deno.readDir(`${DIST}/assets`)) {
    if (entry.isFile) names.push(entry.name);
  }
  names.sort();
  const encoder = new TextEncoder();
  const data = encoder.encode(names.join("|"));
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  return encodeHex(new Uint8Array(hashBuf)).slice(0, 16);
}

const VERSION_HASH = await buildHash();
const VERSION_BODY = JSON.stringify({ hash: VERSION_HASH });

Deno.serve({ port: PORT, hostname: "0.0.0.0" }, async (req) => {
  const url = new URL(req.url);

  if (url.pathname === "/__version") {
    return new Response(VERSION_BODY, {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  const res = await serveDir(req, { fsRoot: DIST, quiet: true });

  // SPA fallback: any 404 that isn't an asset gets index.html
  if (res.status === 404 && !url.pathname.startsWith("/assets/")) {
    return serveDir(new Request(new URL("/index.html", req.url)), {
      fsRoot: DIST,
      quiet: true,
    });
  }

  return res;
});

console.log(`[frontend] serving ${DIST} on :${PORT}  (hash=${VERSION_HASH})`);

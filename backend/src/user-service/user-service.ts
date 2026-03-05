import "https://deno.land/std@0.210.0/dotenv/load.ts";
import { serve } from "https://deno.land/std@0.210.0/http/server.ts";
import { DB } from "https://deno.land/x/sqlite@v3.9.1/mod.ts";
import { createProducer } from "../lib/messaging.ts";

const PORT = Number(Deno.env.get("USER_SERVICE_PORT")) || 5_008;
const DB_PATH = Deno.env.get("USER_DB_PATH") || "./backend/data/users.db";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const producer = await createProducer("user-service").catch((err) => {
  console.warn("[user-service] Redpanda unavailable:", err.message);
  return null;
});

// ── Database setup ─────────────────────────────────────────────────────────────

await Deno.mkdir(DB_PATH.substring(0, DB_PATH.lastIndexOf("/")), { recursive: true }).catch(() => {});
const db = new DB(DB_PATH);

db.query(`CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('trader','admin')),
  avatar_emoji TEXT NOT NULL
);`);

db.query(`CREATE TABLE IF NOT EXISTS trading_limits (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  max_order_qty INTEGER NOT NULL DEFAULT 10000,
  max_daily_notional REAL NOT NULL DEFAULT 1000000.0,
  allowed_strategies TEXT NOT NULL DEFAULT 'LIMIT,TWAP,POV,VWAP'
);`);

db.query(`CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);`);

db.query(`CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  data TEXT NOT NULL DEFAULT '{}'
);`);

// Seed users (INSERT OR IGNORE — idempotent)
const SEED_USERS = [
  { id: "alice", name: "Alice Chen",    role: "trader", emoji: "AC" },
  { id: "bob",   name: "Bob Martinez",  role: "trader", emoji: "BM" },
  { id: "carol", name: "Carol Singh",   role: "trader", emoji: "CS" },
  { id: "dave",  name: "Dave Okafor",   role: "trader", emoji: "DO" },
  { id: "admin", name: "Admin",         role: "admin",  emoji: "AD" },
];

for (const u of SEED_USERS) {
  db.query(
    "INSERT OR IGNORE INTO users (id, name, role, avatar_emoji) VALUES (?, ?, ?, ?);",
    [u.id, u.name, u.role, u.emoji],
  );
  // Update avatar_emoji in case the row already exists with an old value
  db.query("UPDATE users SET avatar_emoji = ? WHERE id = ?;", [u.emoji, u.id]);
  db.query(
    "INSERT OR IGNORE INTO trading_limits (user_id) VALUES (?);",
    [u.id],
  );
  db.query(
    "INSERT OR IGNORE INTO user_preferences (user_id, data) VALUES (?, '{}');",
    [u.id],
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function randomToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function getUserFromToken(token: string | null) {
  if (!token) return null;
  const now = Date.now();
  const rows = [...db.query(
    "SELECT u.id, u.name, u.role, u.avatar_emoji FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?;",
    [token, now],
  )];
  if (rows.length === 0) return null;
  const [id, name, role, avatar_emoji] = rows[0];
  return { id, name, role, avatar_emoji } as { id: string; name: string; role: string; avatar_emoji: string };
}

function getCookieToken(req: Request): string | null {
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(/veta_user=([^;]+)/);
  return match ? match[1] : null;
}

function json(data: unknown, status = 200, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...(extra ?? {}) },
  });
}

// ── Request handler ────────────────────────────────────────────────────────────

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  const url = new URL(req.url);
  const path = url.pathname;

  // GET /health
  if (req.method === "GET" && path === "/health") {
    return json({ service: "user-service", status: "ok" });
  }

  // GET /users
  if (req.method === "GET" && path === "/users") {
    const rows = [...db.query("SELECT id, name, role, avatar_emoji FROM users ORDER BY role DESC, name;")];
    const users = rows.map(([id, name, role, avatar_emoji]) => ({ id, name, role, avatar_emoji }));
    return json(users);
  }

  // POST /sessions — login
  if (req.method === "POST" && path === "/sessions") {
    let body: { userId?: string };
    try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

    const userId = body.userId;
    if (!userId) return json({ error: "userId required" }, 400);

    const userRows = [...db.query("SELECT id, name, role, avatar_emoji FROM users WHERE id = ?;", [userId])];
    if (userRows.length === 0) return json({ error: "user not found" }, 404);

    const [id, name, role, avatar_emoji] = userRows[0];
    const token = randomToken();
    const now = Date.now();
    const expiresAt = now + 8 * 60 * 60 * 1_000; // 8-hour session

    db.query(
      "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?);",
      [token, userId, now, expiresAt],
    );

    producer?.send("user.session", {
      event: "login",
      userId,
      ts: now,
    }).catch(() => {});

    const cookieHeader = `veta_user=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`;
    return json({ id, name, role, avatar_emoji }, 200, { "Set-Cookie": cookieHeader });
  }

  // DELETE /sessions — logout
  if (req.method === "DELETE" && path === "/sessions") {
    const token = getCookieToken(req);
    if (token) {
      const rows = [...db.query("SELECT user_id FROM sessions WHERE token = ?;", [token])];
      if (rows.length > 0) {
        producer?.send("user.session", {
          event: "logout",
          userId: rows[0][0],
          ts: Date.now(),
        }).catch(() => {});
      }
      db.query("DELETE FROM sessions WHERE token = ?;", [token]);
    }
    const clearCookie = `veta_user=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
    return json({ success: true }, 200, { "Set-Cookie": clearCookie });
  }

  // GET /sessions/me — current user
  if (req.method === "GET" && path === "/sessions/me") {
    const token = getCookieToken(req);
    const user = getUserFromToken(token);
    if (!user) return json({ error: "unauthenticated" }, 401);
    return json(user);
  }

  // POST /sessions/validate — internal service-to-service token validation
  // Body: { token: string }
  // Returns: { user, limits } or 401
  if (req.method === "POST" && path === "/sessions/validate") {
    let body: { token?: string };
    try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
    const user = getUserFromToken(body.token ?? null);
    if (!user) return json({ error: "unauthenticated" }, 401);

    const limitRows = [...db.query(
      "SELECT max_order_qty, max_daily_notional, allowed_strategies FROM trading_limits WHERE user_id = ?;",
      [user.id],
    )];
    const limits = limitRows.length > 0
      ? {
          max_order_qty: limitRows[0][0] as number,
          max_daily_notional: limitRows[0][1] as number,
          allowed_strategies: (limitRows[0][2] as string).split(","),
        }
      : { max_order_qty: 10000, max_daily_notional: 1_000_000, allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP"] };

    return json({ user, limits });
  }

  // GET /users/:id/limits
  const limitsMatch = path.match(/^\/users\/([^/]+)\/limits$/);
  if (limitsMatch) {
    const userId = limitsMatch[1];
    if (req.method === "GET") {
      const rows = [...db.query(
        "SELECT max_order_qty, max_daily_notional, allowed_strategies FROM trading_limits WHERE user_id = ?;",
        [userId],
      )];
      if (rows.length === 0) return json({ error: "user not found" }, 404);
      const [max_order_qty, max_daily_notional, allowed_strategies] = rows[0];
      return json({
        userId,
        max_order_qty,
        max_daily_notional,
        allowed_strategies: (allowed_strategies as string).split(","),
      });
    }
    if (req.method === "PUT") {
      const token = getCookieToken(req);
      const caller = getUserFromToken(token);
      if (!caller) return json({ error: "unauthenticated" }, 401);
      if (caller.role !== "admin") return json({ error: "forbidden — admin only" }, 403);

      let body: { max_order_qty?: number; max_daily_notional?: number; allowed_strategies?: string[] };
      try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

      const current = [...db.query(
        "SELECT max_order_qty, max_daily_notional, allowed_strategies FROM trading_limits WHERE user_id = ?;",
        [userId],
      )];
      if (current.length === 0) return json({ error: "user not found" }, 404);

      const [cur_qty, cur_notional, cur_strategies] = current[0];
      db.query(
        "UPDATE trading_limits SET max_order_qty = ?, max_daily_notional = ?, allowed_strategies = ? WHERE user_id = ?;",
        [
          body.max_order_qty ?? (cur_qty as number),
          body.max_daily_notional ?? (cur_notional as number),
          body.allowed_strategies ? body.allowed_strategies.join(",") : (cur_strategies as string),
          userId,
        ],
      );
      return json({ success: true });
    }
  }

  // GET/PUT /users/:id/preferences
  const prefsMatch = path.match(/^\/users\/([^/]+)\/preferences$/);
  if (prefsMatch) {
    const userId = prefsMatch[1];
    if (req.method === "GET") {
      const rows = [...db.query("SELECT data FROM user_preferences WHERE user_id = ?;", [userId])];
      if (rows.length === 0) return json({ error: "user not found" }, 404);
      let data = {};
      try { data = JSON.parse(rows[0][0] as string); } catch { /* ignore */ }
      return json(data);
    }
    if (req.method === "PUT") {
      const token = getCookieToken(req);
      const caller = getUserFromToken(token);
      if (!caller) return json({ error: "unauthenticated" }, 401);
      if (caller.id !== userId && caller.role !== "admin") return json({ error: "forbidden" }, 403);

      let body: Record<string, unknown>;
      try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
      db.query(
        "INSERT INTO user_preferences (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data;",
        [userId, JSON.stringify(body)],
      );
      return json({ success: true });
    }
  }

  return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
}

console.log(`👤 User service running on port ${PORT}`);
serve(handle, { port: PORT });

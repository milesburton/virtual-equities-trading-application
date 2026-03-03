import { useState } from "react";
import type { AuthUser } from "../store/authSlice.ts";
import { setUser } from "../store/authSlice.ts";
import { useAppDispatch } from "../store/hooks.ts";

interface SeedUser {
  id: string;
  name: string;
  role: "trader" | "admin";
  avatar_emoji: string;
}

const SEED_USERS: SeedUser[] = [
  { id: "alice", name: "Alice Chen", role: "trader", avatar_emoji: "👩‍💼" },
  { id: "bob", name: "Bob Martinez", role: "trader", avatar_emoji: "👨‍💻" },
  { id: "carol", name: "Carol Singh", role: "trader", avatar_emoji: "👩‍🔬" },
  { id: "dave", name: "Dave Okafor", role: "trader", avatar_emoji: "🧑‍💼" },
  { id: "admin", name: "Admin", role: "admin", avatar_emoji: "🔐" },
];

export function LoginPage() {
  const dispatch = useAppDispatch();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(user: SeedUser) {
    setLoading(user.id);
    setError(null);
    try {
      const res = await fetch("/api/user-service/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Login failed (${res.status})`);
      const data: AuthUser = await res.json();
      dispatch(setUser(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-950">
      <div className="w-full max-w-2xl px-6">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="text-emerald-400 font-bold tracking-widest uppercase text-sm mb-2">
            Virtual Equities Trading
          </div>
          <h1 className="text-2xl font-semibold text-gray-100 mb-1">Select your profile</h1>
          <p className="text-gray-500 text-sm">Choose a trader to begin your session</p>
        </div>

        {/* Avatar tiles */}
        <div className="grid grid-cols-5 gap-3">
          {SEED_USERS.map((user) => {
            const isLoading = loading === user.id;
            return (
              <button
                key={user.id}
                type="button"
                onClick={() => handleSelect(user)}
                disabled={loading !== null}
                className={`
                  group flex flex-col items-center gap-3 p-4 rounded-xl border transition-all duration-150
                  ${
                    loading !== null && !isLoading
                      ? "opacity-40 cursor-not-allowed border-gray-800 bg-gray-900/30"
                      : "cursor-pointer border-gray-700 bg-gray-900 hover:border-emerald-500 hover:bg-gray-800 hover:shadow-[0_0_20px_rgba(52,211,153,0.15)]"
                  }
                  ${isLoading ? "border-emerald-500 bg-gray-800 shadow-[0_0_20px_rgba(52,211,153,0.15)]" : ""}
                `}
              >
                <span className="text-4xl leading-none select-none">{user.avatar_emoji}</span>
                <div className="text-center">
                  <div className="text-gray-100 font-medium text-xs leading-tight">{user.name}</div>
                  <div
                    className={`text-[10px] mt-1 font-medium uppercase tracking-wider px-1.5 py-0.5 rounded ${
                      user.role === "admin"
                        ? "bg-orange-900/50 text-orange-400"
                        : "bg-blue-900/50 text-blue-400"
                    }`}
                  >
                    {user.role}
                  </div>
                </div>
                {isLoading && (
                  <div className="w-3 h-3 border border-emerald-500 border-t-transparent rounded-full animate-spin" />
                )}
              </button>
            );
          })}
        </div>

        {error && (
          <div className="mt-6 text-center text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-4 py-2">
            {error}
          </div>
        )}

        <div className="mt-8 text-center text-gray-700 text-xs">
          Demo environment — no authentication required
        </div>
      </div>
    </div>
  );
}

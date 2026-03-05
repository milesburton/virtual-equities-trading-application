import { useState } from "react";
import type { AuthUser } from "../store/authSlice.ts";
import { setUser } from "../store/authSlice.ts";
import { useAppDispatch } from "../store/hooks.ts";
import { SERVICES, useGetServiceHealthQuery } from "../store/servicesApi.ts";

// Core (non-optional) services that must be up for the platform to be tradeable
const CORE_SERVICES = SERVICES.filter((s) => !s.optional);

// Each service needs its own hook call — fixed list means fixed hook order is safe
function useCoreServiceStates() {
  const r0 = useGetServiceHealthQuery(CORE_SERVICES[0], {
    pollingInterval: 5_000,
    skip: !CORE_SERVICES[0],
  });
  const r1 = useGetServiceHealthQuery(CORE_SERVICES[1], {
    pollingInterval: 5_000,
    skip: !CORE_SERVICES[1],
  });
  const r2 = useGetServiceHealthQuery(CORE_SERVICES[2], {
    pollingInterval: 5_000,
    skip: !CORE_SERVICES[2],
  });
  const r3 = useGetServiceHealthQuery(CORE_SERVICES[3], {
    pollingInterval: 5_000,
    skip: !CORE_SERVICES[3],
  });
  const r4 = useGetServiceHealthQuery(CORE_SERVICES[4], {
    pollingInterval: 5_000,
    skip: !CORE_SERVICES[4],
  });
  const r5 = useGetServiceHealthQuery(CORE_SERVICES[5], {
    pollingInterval: 5_000,
    skip: !CORE_SERVICES[5],
  });
  const r6 = useGetServiceHealthQuery(CORE_SERVICES[6], {
    pollingInterval: 5_000,
    skip: !CORE_SERVICES[6],
  });
  const r7 = useGetServiceHealthQuery(CORE_SERVICES[7], {
    pollingInterval: 5_000,
    skip: !CORE_SERVICES[7],
  });
  return [r0, r1, r2, r3, r4, r5, r6, r7].slice(0, CORE_SERVICES.length);
}

function PlatformStatus() {
  const results = useCoreServiceStates();

  const anyLoading = results.some((r) => r.isLoading);
  const anyError = results.some((r) => !r.isLoading && r.data?.state !== "ok");
  const allOk = !anyLoading && !anyError;

  const summaryLabel = anyLoading
    ? "Checking platform…"
    : allOk
      ? "Platform ready"
      : "Platform degraded";
  const summaryColor = anyLoading
    ? "text-gray-500"
    : allOk
      ? "text-emerald-400"
      : "text-yellow-400";
  const dotColor = anyLoading
    ? "bg-gray-500 animate-pulse"
    : allOk
      ? "bg-emerald-400"
      : "bg-yellow-400";

  return (
    <div className="mt-10 border-t border-gray-800 pt-5 space-y-3">
      {/* Summary */}
      <div className="flex items-center justify-center gap-2">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
        <span className={`text-xs font-medium ${summaryColor}`}>{summaryLabel}</span>
      </div>
      {/* Per-service dots */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {CORE_SERVICES.map((s, i) => {
          const r = results[i];
          const state = r?.isLoading ? "checking" : (r?.data?.state ?? "error");
          return (
            <span key={s.name} title={s.name} className="flex items-center gap-1 text-[11px]">
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  state === "ok"
                    ? "bg-emerald-400"
                    : state === "checking"
                      ? "bg-gray-500 animate-pulse"
                      : "bg-red-500"
                }`}
              />
              <span
                className={
                  state === "ok"
                    ? "text-gray-500"
                    : state === "checking"
                      ? "text-gray-600"
                      : "text-red-400"
                }
              >
                {s.name}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

interface SeedUser {
  id: string;
  name: string;
  role: "trader" | "admin";
  avatar_emoji: string;
}

const SEED_USERS: SeedUser[] = [
  { id: "alice", name: "Alice Chen", role: "trader", avatar_emoji: "AC" },
  { id: "bob", name: "Bob Martinez", role: "trader", avatar_emoji: "BM" },
  { id: "carol", name: "Carol Singh", role: "trader", avatar_emoji: "CS" },
  { id: "dave", name: "Dave Okafor", role: "trader", avatar_emoji: "DO" },
  { id: "admin", name: "Admin", role: "admin", avatar_emoji: "AD" },
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
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-semibold tracking-wide select-none ${
                    user.role === "admin"
                      ? "bg-orange-900/60 text-orange-300 border border-orange-700/50"
                      : "bg-gray-800 text-gray-200 border border-gray-600/50"
                  }`}
                >
                  {user.avatar_emoji}
                </div>
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

        <PlatformStatus />
      </div>
    </div>
  );
}

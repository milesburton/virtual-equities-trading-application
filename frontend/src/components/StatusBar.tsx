import { useSignal } from "@preact/signals-react";
import { useEffect } from "react";
import { clearUser } from "../store/authSlice.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { SERVICES, useGetServiceHealthQuery } from "../store/servicesApi.ts";
import type { ServiceHealth } from "../types.ts";
import { ComponentPicker } from "./ComponentPicker.tsx";
import { useDashboard } from "./DashboardLayout.tsx";
import { ServiceStatus } from "./ServiceStatus.tsx";
import { TemplatePicker } from "./TemplatePicker.tsx";

function useAllServiceHealth(): ServiceHealth[] {
  const r0 = useGetServiceHealthQuery(SERVICES[0], { pollingInterval: 10_000 });
  const r1 = useGetServiceHealthQuery(SERVICES[1], { pollingInterval: 10_000 });
  const r2 = useGetServiceHealthQuery(SERVICES[2], { pollingInterval: 10_000 });
  const r3 = useGetServiceHealthQuery(SERVICES[3], { pollingInterval: 10_000 });
  const r4 = useGetServiceHealthQuery(SERVICES[4], { pollingInterval: 10_000 });
  const r5 = useGetServiceHealthQuery(SERVICES[5], { pollingInterval: 10_000 });
  const r6 = useGetServiceHealthQuery(SERVICES[6], { pollingInterval: 10_000 });
  const r7 = useGetServiceHealthQuery(SERVICES[7], { pollingInterval: 10_000 });
  const r8 = useGetServiceHealthQuery(SERVICES[8], { pollingInterval: 10_000 });
  const r9 = useGetServiceHealthQuery(SERVICES[9], { pollingInterval: 10_000 });
  const r10 = useGetServiceHealthQuery(SERVICES[10], { pollingInterval: 10_000 });
  const r11 = useGetServiceHealthQuery(SERVICES[11], { pollingInterval: 10_000 });

  return SERVICES.map((svc, i) => {
    const result = [r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11][i];
    if (result.data) return result.data;
    if (result.isError) {
      return {
        name: svc.name,
        url: svc.url,
        link: svc.link,
        optional: svc.optional,
        state: "error" as const,
        version: "—",
        meta: {},
        lastChecked: Date.now(),
      };
    }
    return {
      name: svc.name,
      url: svc.url,
      link: svc.link,
      optional: svc.optional,
      state: "unknown" as const,
      version: "—",
      meta: {},
      lastChecked: null,
    };
  });
}

// ─── AppHeader: brand + feed + services + clock + user ───────────────────────

export function AppHeader() {
  const connected = useAppSelector((s) => s.market.connected);
  const updateAvailable = useAppSelector((s) => s.ui.updateAvailable);
  const user = useAppSelector((s) => s.auth.user);
  const services = useAllServiceHealth();
  const time = useSignal(new Date().toLocaleTimeString());
  const dispatch = useAppDispatch();

  useEffect(() => {
    const id = setInterval(() => {
      time.value = new Date().toLocaleTimeString();
    }, 1000);
    return () => clearInterval(id);
  }, [time]);

  async function handleLogout() {
    try {
      await fetch("/api/user-service/sessions", { method: "DELETE", credentials: "include" });
    } finally {
      dispatch(clearUser());
    }
  }

  return (
    <div className="shrink-0">
      {updateAvailable && (
        <div className="flex items-center justify-center gap-3 px-4 py-1.5 bg-amber-900/60 border-b border-amber-700/60 text-xs text-amber-300">
          <span>A new version is available.</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium transition-colors"
          >
            Reload
          </button>
        </div>
      )}
      <div className="flex items-center justify-between px-4 h-10 bg-gray-900 border-b border-gray-800 text-xs text-gray-400">
        <div className="flex items-center gap-5">
          <span className="text-emerald-400 font-bold tracking-widest uppercase text-[11px]">
            Equities Trading Simulator
          </span>
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                connected ? "bg-emerald-400 shadow-[0_0_6px_#34d399]" : "bg-red-500"
              }`}
            />
            <span className={connected ? "text-emerald-400" : "text-red-400"}>
              {connected ? "Live" : "Disconnected"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <ServiceStatus services={services} />
          <span className="tabular-nums text-gray-500">{time.value}</span>
          {user && (
            <div className="flex items-center gap-2 pl-3 border-l border-gray-800">
              <span className="flex items-center gap-1.5 text-gray-400">
                <span
                  className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-semibold tracking-wide ${
                    user.role === "admin"
                      ? "bg-orange-900/60 text-orange-300"
                      : "bg-gray-700 text-gray-200"
                  }`}
                >
                  {user.avatar_emoji}
                </span>
                <span>{user.name}</span>
                <span
                  className={`text-[9px] font-medium uppercase px-1 py-0.5 rounded ${
                    user.role === "admin"
                      ? "bg-orange-900/50 text-orange-400"
                      : "bg-blue-900/50 text-blue-400"
                  }`}
                >
                  {user.role}
                </span>
              </span>
              <button
                type="button"
                onClick={handleLogout}
                title="Log out"
                className="text-gray-600 hover:text-gray-300 transition-colors text-[10px] leading-none px-1.5 py-0.5 border border-gray-700 hover:border-gray-500 rounded"
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── WorkspaceToolbar: layout controls scoped to the active workspace ─────────

export function WorkspaceToolbar() {
  const { resetLayout } = useDashboard();

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-950 border-b border-gray-800 text-xs">
      <ComponentPicker />
      <div className="w-px h-3.5 bg-gray-800" />
      <TemplatePicker />
      <button
        type="button"
        onClick={() => resetLayout()}
        title="Reset workspace to default layout"
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 transition-colors px-1.5 py-0.5 rounded border border-gray-700 hover:border-gray-500"
        aria-label="Reset layout"
      >
        ↺ Reset layout
      </button>
    </div>
  );
}

// ─── StatusBar: kept for backwards-compat imports in tests ────────────────────

export function StatusBar() {
  return (
    <>
      <AppHeader />
      <WorkspaceToolbar />
    </>
  );
}

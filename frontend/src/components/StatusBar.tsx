import { useSignal } from "@preact/signals-react";
import { useEffect } from "react";
import { useAppSelector } from "../store/hooks.ts";
import { SERVICES, useGetServiceHealthQuery } from "../store/servicesApi.ts";
import type { ServiceHealth } from "../types.ts";
import { ComponentPicker } from "./ComponentPicker.tsx";
import { useDashboard } from "./DashboardLayout.tsx";
import { ServiceStatus } from "./ServiceStatus.tsx";

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

  return SERVICES.map((svc, i) => {
    const result = [r0, r1, r2, r3, r4, r5, r6, r7, r8, r9][i];
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

export function StatusBar() {
  const connected = useAppSelector((s) => s.market.connected);
  const services = useAllServiceHealth();
  const time = useSignal(new Date().toLocaleTimeString());
  const { resetLayout } = useDashboard();

  useEffect(() => {
    const id = setInterval(() => {
      time.value = new Date().toLocaleTimeString();
    }, 1000);
    return () => clearInterval(id);
  }, [time]);

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700 text-xs text-gray-400">
      <div className="flex items-center gap-6">
        <span className="text-emerald-400 font-semibold tracking-widest uppercase text-xs">
          Equities Market Emulator
        </span>
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              connected ? "bg-emerald-400 shadow-[0_0_6px_#34d399]" : "bg-red-500"
            }`}
          />
          <span className={connected ? "text-emerald-400" : "text-red-400"}>
            Market Feed {connected ? "LIVE" : "DISCONNECTED"}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <ComponentPicker />
        <button
          type="button"
          onClick={resetLayout}
          title="Reset workspace to default layout"
          className="text-gray-600 hover:text-gray-300 transition-colors text-base leading-none"
          aria-label="Reset layout"
        >
          ↺
        </button>
        <ServiceStatus services={services} />
        <span className="tabular-nums">{time.value}</span>
      </div>
    </div>
  );
}

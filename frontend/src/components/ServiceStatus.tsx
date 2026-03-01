import { useState } from "react";
import type { ServiceHealth, ServiceState } from "../hooks/useServiceHealth.ts";

interface Props {
  services: ServiceHealth[];
}

function dot(state: ServiceState) {
  if (state === "ok") return "bg-emerald-400 shadow-[0_0_6px_#34d399]";
  if (state === "error") return "bg-red-500 shadow-[0_0_6px_#f87171]";
  return "bg-gray-500";
}

function label(state: ServiceState) {
  if (state === "ok") return <span className="text-emerald-400">ok</span>;
  if (state === "error") return <span className="text-red-400">error</span>;
  return <span className="text-gray-500">—</span>;
}

function aggregateState(services: ServiceHealth[]): ServiceState {
  if (services.some((s) => s.state === "error")) return "error";
  if (services.some((s) => s.state === "unknown")) return "unknown";
  return "ok";
}

export function ServiceStatus({ services }: Props) {
  const [open, setOpen] = useState(false);
  const overall = aggregateState(services);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
      >
        <span className={`inline-block w-2 h-2 rounded-full ${dot(overall)}`} />
        Services
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close service status panel"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />

          <div className="absolute right-0 top-7 z-20 w-96 bg-gray-900 border border-gray-700 rounded shadow-xl text-xs">
            <div className="px-3 py-2 border-b border-gray-700 flex items-center justify-between">
              <span className="font-semibold text-gray-300 uppercase tracking-wider">
                Service Health
              </span>
              <span className="text-gray-600">polls every 10s</span>
            </div>

            <table className="w-full">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800">
                  <th className="text-left px-3 py-2">Service</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Version</th>
                  <th className="text-left px-3 py-2">Info</th>
                </tr>
              </thead>
              <tbody>
                {services.map((svc) => (
                  <tr key={svc.name} className="border-b border-gray-800/40">
                    <td className="px-3 py-2 flex items-center gap-2 whitespace-nowrap">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${dot(svc.state)}`} />
                      <span className="text-gray-200">{svc.name}</span>
                    </td>
                    <td className="px-3 py-2">{label(svc.state)}</td>
                    <td className="px-3 py-2 font-mono text-gray-400">{svc.version}</td>
                    <td className="px-3 py-2 text-gray-500">
                      {Object.entries(svc.meta).length > 0
                        ? Object.entries(svc.meta)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(", ")
                        : svc.lastChecked
                          ? new Date(svc.lastChecked).toLocaleTimeString()
                          : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

import { useSignal } from "@preact/signals-react";
import type { ServiceHealth, ServiceState } from "../types.ts";
import { ServiceRow } from "./ServiceRow";
import { StatusDot } from "./StatusDot";

interface Props {
  services: ServiceHealth[];
}

function aggregateState(services: ServiceHealth[]): ServiceState {
  const required = services.filter((s) => !s.optional);
  if (required.some((s) => s.state === "error")) return "error";
  if (required.some((s) => s.state === "unknown")) return "unknown";
  return "ok";
}

/** Returns { consistent: true, version } if all healthy required services share one version. */
function versionSummary(services: ServiceHealth[]): {
  consistent: boolean;
  version: string | null;
  lastChecked: number | null;
} {
  const checked = services.filter((s) => !s.optional && s.state === "ok" && s.version !== "—");
  const versions = [...new Set(checked.map((s) => s.version))];
  const lastChecked = checked.reduce<number | null>((max, s) => {
    if (s.lastChecked === null) return max;
    return max === null ? s.lastChecked : Math.max(max, s.lastChecked);
  }, null);
  if (versions.length === 0) return { consistent: false, version: null, lastChecked };
  if (versions.length === 1) return { consistent: true, version: versions[0], lastChecked };
  return { consistent: false, version: null, lastChecked };
}

export function ServiceStatus({ services }: Props) {
  const open = useSignal(false);
  const overall = aggregateState(services);
  const { consistent, version, lastChecked } = versionSummary(services);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          open.value = !open.value;
        }}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
      >
        <StatusDot state={overall} className="w-2 h-2" />
        Services
      </button>

      {open.value && (
        <>
          <button
            type="button"
            aria-label="Close service status panel"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => {
              open.value = false;
            }}
          />

          <div className="absolute right-0 top-7 z-20 w-96 bg-gray-900 border border-gray-700 rounded shadow-xl text-xs">
            <div className="px-3 py-2 border-b border-gray-700 flex items-center justify-between">
              <span className="font-semibold text-gray-300 uppercase tracking-wider">
                Service Health
              </span>
              <div className="flex flex-col items-end gap-0.5">
                {consistent && version ? (
                  <span className="font-mono text-emerald-400">v{version}</span>
                ) : (
                  <span className="text-amber-400">version mismatch</span>
                )}
                <span className="text-gray-600">
                  {lastChecked
                    ? `checked ${new Date(lastChecked).toLocaleTimeString()}`
                    : "polls every 10s"}
                </span>
              </div>
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
                  <ServiceRow key={svc.name} svc={svc} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

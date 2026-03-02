import type { ServiceState } from "../hooks/useServiceHealth.ts";

export function StatusDot({ state, className = "" }: { state: ServiceState; className?: string }) {
  function cls(s: ServiceState) {
    if (s === "ok") return "bg-emerald-400 shadow-[0_0_6px_#34d399]";
    if (s === "error") return "bg-red-500 shadow-[0_0_6px_#f87171]";
    return "bg-gray-500";
  }

  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${cls(state)} ${className}`} />;
}

export default StatusDot;

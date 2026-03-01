import { useEffect, useState } from "react";
import type { ServiceHealth } from "../hooks/useServiceHealth.ts";
import { ServiceStatus } from "./ServiceStatus.tsx";

interface Props {
  connected: boolean;
  services: ServiceHealth[];
}

export function StatusBar({ connected, services }: Props) {
  const [time, setTime] = useState(() => new Date().toLocaleTimeString());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(id);
  }, []);

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
      <div className="flex items-center gap-6">
        <ServiceStatus services={services} />
        <span className="tabular-nums">{time}</span>
      </div>
    </div>
  );
}

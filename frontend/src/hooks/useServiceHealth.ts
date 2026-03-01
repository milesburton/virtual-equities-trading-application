import { useEffect, useRef, useState } from "react";

export type ServiceState = "ok" | "error" | "unknown";

export interface ServiceHealth {
  name: string;
  url: string;
  state: ServiceState;
  version: string;
  /** Extra fields returned by the service (e.g. pending order count) */
  meta: Record<string, unknown>;
  lastChecked: number | null;
}

const SERVICES: { name: string; url: string }[] = [
  {
    name: "Market Sim",
    url: `${import.meta.env.VITE_MARKET_HTTP_URL ?? "http://localhost:5000"}/health`,
  },
  {
    name: "EMS",
    url: `${import.meta.env.VITE_EMS_URL ?? "http://localhost:5001"}/health`,
  },
  {
    name: "OMS",
    url: `${import.meta.env.VITE_OMS_URL ?? "http://localhost:5002"}/health`,
  },
  {
    name: "Limit Algo",
    url: `${import.meta.env.VITE_LIMIT_URL ?? "http://localhost:5003"}/health`,
  },
  {
    name: "TWAP Algo",
    url: `${import.meta.env.VITE_TWAP_URL ?? "http://localhost:5004"}/health`,
  },
  {
    name: "POV Algo",
    url: `${import.meta.env.VITE_POV_URL ?? "http://localhost:5005"}/health`,
  },
  {
    name: "VWAP Algo",
    url: `${import.meta.env.VITE_VWAP_URL ?? "http://localhost:5006"}/health`,
  },
];

const POLL_INTERVAL_MS = 10_000;

function initServices(): ServiceHealth[] {
  return SERVICES.map((s) => ({
    name: s.name,
    url: s.url,
    state: "unknown",
    version: "—",
    meta: {},
    lastChecked: null,
  }));
}

async function checkService(svc: { name: string; url: string }): Promise<ServiceHealth> {
  try {
    const res = await fetch(svc.url, { signal: AbortSignal.timeout(4_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const { version, ...rest } = body;
    // strip known top-level fields so only extras end up in meta
    const { service: _s, status: _st, ...meta } = rest;
    return {
      name: svc.name,
      url: svc.url,
      state: "ok",
      version: String(version ?? "—"),
      meta,
      lastChecked: Date.now(),
    };
  } catch {
    return {
      name: svc.name,
      url: svc.url,
      state: "error",
      version: "—",
      meta: {},
      lastChecked: Date.now(),
    };
  }
}

export function useServiceHealth() {
  const [services, setServices] = useState<ServiceHealth[]>(initServices);
  const baseline = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const results = await Promise.all(SERVICES.map(checkService));
      if (cancelled) return;

      for (const svc of results) {
        if (svc.state !== "ok" || svc.version === "dev" || svc.version === "—") continue;
        const known = baseline.current.get(svc.name);
        if (known === undefined) {
          baseline.current.set(svc.name, svc.version);
        } else if (known !== svc.version) {
          window.location.reload();
          return;
        }
      }

      setServices(results);
    }

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return services;
}

import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { ServiceHealth } from "../types.ts";

// Derive base from current origin so the app works behind Traefik without env vars.
// VITE_* overrides remain available for non-standard deployments.
const _origin = typeof window !== "undefined" ? window.location.origin : "";

const _traefik =
  import.meta.env.VITE_TRAEFIK_DASHBOARD_URL ?? `${_origin.replace(/:(\d+)$/, "")}:8888`;

const SERVICES: { name: string; url: string; link?: string; optional?: boolean }[] = [
  {
    name: "Market Sim",
    url: `${import.meta.env.VITE_MARKET_HTTP_URL ?? `${_origin}/api/market-sim`}/health`,
    link: `${import.meta.env.VITE_MARKET_HTTP_URL ?? `${_origin}/api/market-sim`}/health`,
  },
  {
    name: "EMS",
    url: `${import.meta.env.VITE_EMS_URL ?? `${_origin}/api/ems`}/health`,
    link: `${import.meta.env.VITE_EMS_URL ?? `${_origin}/api/ems`}/health`,
  },
  {
    name: "OMS",
    url: `${import.meta.env.VITE_OMS_URL ?? `${_origin}/api/oms`}/health`,
    link: `${import.meta.env.VITE_OMS_URL ?? `${_origin}/api/oms`}/health`,
  },
  {
    name: "Limit Algo",
    url: `${import.meta.env.VITE_LIMIT_URL ?? `${_origin}/api/limit-algo`}/health`,
    link: `${import.meta.env.VITE_LIMIT_URL ?? `${_origin}/api/limit-algo`}/health`,
  },
  {
    name: "TWAP Algo",
    url: `${import.meta.env.VITE_TWAP_URL ?? `${_origin}/api/twap-algo`}/health`,
    link: `${import.meta.env.VITE_TWAP_URL ?? `${_origin}/api/twap-algo`}/health`,
  },
  {
    name: "POV Algo",
    url: `${import.meta.env.VITE_POV_URL ?? `${_origin}/api/pov-algo`}/health`,
    link: `${import.meta.env.VITE_POV_URL ?? `${_origin}/api/pov-algo`}/health`,
  },
  {
    name: "VWAP Algo",
    url: `${import.meta.env.VITE_VWAP_URL ?? `${_origin}/api/vwap-algo`}/health`,
    link: `${import.meta.env.VITE_VWAP_URL ?? `${_origin}/api/vwap-algo`}/health`,
  },
  {
    name: "Observability",
    url: `${import.meta.env.VITE_OBS_URL ?? `${_origin}/api/observability`}/health`,
    link: `${import.meta.env.VITE_OBS_URL ?? `${_origin}/api/observability`}/health`,
    optional: true,
  },
  {
    name: "FIX Gateway",
    url: `${import.meta.env.VITE_FIX_GW_URL ?? `${_origin}/api/fix-gateway`}/health`,
    link: `${import.meta.env.VITE_FIX_GW_URL ?? `${_origin}/api/fix-gateway`}/health`,
    optional: true,
  },
  {
    name: "Traefik",
    url: `${_traefik}/api/overview`,
    link: _traefik,
    optional: true,
  },
];

export { SERVICES };

export const servicesApi = createApi({
  reducerPath: "servicesApi",
  baseQuery: fetchBaseQuery({ baseUrl: "" }),
  endpoints: (builder) => ({
    getServiceHealth: builder.query<
      ServiceHealth,
      { name: string; url: string; link?: string; optional?: boolean }
    >({
      query: ({ url }) => ({ url }),
      transformResponse: (body: Record<string, unknown>, _meta, arg) => {
        const { version, ...rest } = body;
        const { service: _s, status: _st, ...meta } = rest;
        return {
          name: arg.name,
          url: arg.url,
          link: arg.link,
          optional: arg.optional,
          state: "ok" as const,
          version: String(version ?? "—"),
          meta: meta as Record<string, unknown>,
          lastChecked: Date.now(),
        };
      },
      transformErrorResponse: (_response, _meta, arg) => ({
        name: arg.name,
        url: arg.url,
        link: arg.link,
        optional: arg.optional,
        state: "error" as const,
        version: "—",
        meta: {},
        lastChecked: Date.now(),
      }),
    }),
  }),
});

export const { useGetServiceHealthQuery } = servicesApi;

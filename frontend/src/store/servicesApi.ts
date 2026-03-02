import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { ServiceHealth } from "../types.ts";

const SERVICES: { name: string; url: string }[] = [
  { name: "Market Sim", url: `${import.meta.env.VITE_MARKET_HTTP_URL ?? "http://localhost:5000"}/health` },
  { name: "EMS", url: `${import.meta.env.VITE_EMS_URL ?? "http://localhost:5001"}/health` },
  { name: "OMS", url: `${import.meta.env.VITE_OMS_URL ?? "http://localhost:5002"}/health` },
  { name: "Limit Algo", url: `${import.meta.env.VITE_LIMIT_URL ?? "http://localhost:5003"}/health` },
  { name: "TWAP Algo", url: `${import.meta.env.VITE_TWAP_URL ?? "http://localhost:5004"}/health` },
  { name: "POV Algo", url: `${import.meta.env.VITE_POV_URL ?? "http://localhost:5005"}/health` },
  { name: "VWAP Algo", url: `${import.meta.env.VITE_VWAP_URL ?? "http://localhost:5006"}/health` },
];

export { SERVICES };

export const servicesApi = createApi({
  reducerPath: "servicesApi",
  baseQuery: fetchBaseQuery({ baseUrl: "" }),
  endpoints: (builder) => ({
    getServiceHealth: builder.query<ServiceHealth, { name: string; url: string }>({
      query: ({ url }) => ({ url }),
      transformResponse: (body: Record<string, unknown>, _meta, arg) => {
        const { version, ...rest } = body;
        const { service: _s, status: _st, ...meta } = rest;
        return {
          name: arg.name,
          url: arg.url,
          state: "ok" as const,
          version: String(version ?? "—"),
          meta: meta as Record<string, unknown>,
          lastChecked: Date.now(),
        };
      },
      transformErrorResponse: (_response, _meta, arg) => ({
        name: arg.name,
        url: arg.url,
        state: "error" as const,
        version: "—",
        meta: {},
        lastChecked: Date.now(),
      }),
    }),
  }),
});

export const { useGetServiceHealthQuery } = servicesApi;

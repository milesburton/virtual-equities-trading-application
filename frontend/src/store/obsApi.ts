import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { ObsEvent } from "../types.ts";

const OBS_URL = import.meta.env.VITE_OBS_URL ?? "http://localhost:5007";

export const obsApi = createApi({
  reducerPath: "obsApi",
  baseQuery: fetchBaseQuery({ baseUrl: OBS_URL }),
  endpoints: (builder) => ({
    getHistoricEvents: builder.query<ObsEvent[], void>({
      query: () => "/events",
    }),
  }),
});

export const { useGetHistoricEventsQuery } = obsApi;

import type { Middleware } from "@reduxjs/toolkit";
import { servicesApi } from "../servicesApi.ts";

export const versionWatchMiddleware: Middleware = () => {
  const baseline = new Map<string, string>();

  return (next) => (action) => {
    const result = next(action);

    if (servicesApi.endpoints.getServiceHealth.matchFulfilled(action)) {
      const svc = action.payload;
      if (svc.state !== "ok" || svc.version === "dev" || svc.version === "—") return result;
      const known = baseline.get(svc.name);
      if (known === undefined) {
        baseline.set(svc.name, svc.version);
      } else if (known !== svc.version) {
        window.location.reload();
      }
    }

    return result;
  };
};

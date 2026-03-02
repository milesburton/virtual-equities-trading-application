import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react({ babel: { plugins: [["module:@preact/signals-react-transform"]] } })],
  server: {
    port: 8080,
    host: true,
    proxy: {
      // WebSocket feed
      "/ws/market-sim": {
        target: "ws://localhost:5000",
        ws: true,
        rewrite: (path) => path.replace(/^\/ws\/market-sim/, "/ws"),
      },
      // REST / SSE back-ends
      "/api/market-sim": {
        target: "http://localhost:5000",
        rewrite: (path) => path.replace(/^\/api\/market-sim/, ""),
      },
      "/api/ems": {
        target: "http://localhost:5001",
        rewrite: (path) => path.replace(/^\/api\/ems/, ""),
      },
      "/api/oms": {
        target: "http://localhost:5002",
        rewrite: (path) => path.replace(/^\/api\/oms/, ""),
      },
      "/api/limit-algo": {
        target: "http://localhost:5003",
        rewrite: (path) => path.replace(/^\/api\/limit-algo/, ""),
      },
      "/api/twap-algo": {
        target: "http://localhost:5004",
        rewrite: (path) => path.replace(/^\/api\/twap-algo/, ""),
      },
      "/api/pov-algo": {
        target: "http://localhost:5005",
        rewrite: (path) => path.replace(/^\/api\/pov-algo/, ""),
      },
      "/api/vwap-algo": {
        target: "http://localhost:5006",
        rewrite: (path) => path.replace(/^\/api\/vwap-algo/, ""),
      },
      "/api/observability": {
        target: "http://localhost:5007",
        rewrite: (path) => path.replace(/^\/api\/observability/, ""),
      },
      "/api/fix-gateway": {
        target: "http://localhost:9881",
        rewrite: (path) => path.replace(/^\/api\/fix-gateway/, ""),
      },
      "/ws/fix": {
        target: "ws://localhost:9881",
        ws: true,
        rewrite: (path) => path.replace(/^\/ws\/fix/, "/ws/fix"),
      },
    },
  },
});

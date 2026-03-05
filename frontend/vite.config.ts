import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react({ babel: { plugins: [["module:@preact/signals-react-transform"]] } })],
  server: {
    port: 5173, // socat on 8080 proxies here
    host: true,
    open: false,
    proxy: {
      // Single gateway WebSocket — replaces direct market-sim + FIX WebSocket connections
      "/ws/gateway": {
        target: "ws://localhost:5011",
        ws: true,
        rewrite: (path) => path.replace(/^\/ws\/gateway/, "/ws"),
      },
      // Gateway REST API — proxies assets, candles, orders history
      "/api/gateway": {
        target: "http://localhost:5011",
        rewrite: (path) => path.replace(/^\/api\/gateway/, ""),
      },
      // Internal service health endpoints (retained for ServiceStatus panel)
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
      "/api/user-service": {
        target: "http://localhost:5008",
        rewrite: (path) => path.replace(/^\/api\/user-service/, ""),
      },
      "/api/journal": {
        target: "http://localhost:5009",
        rewrite: (path) => path.replace(/^\/api\/journal/, ""),
      },
      "/api/candle-store": {
        target: "http://localhost:5010",
        rewrite: (path) => path.replace(/^\/api\/candle-store/, ""),
      },
      "/api/fix-archive": {
        target: "http://localhost:5012",
        rewrite: (path) => path.replace(/^\/api\/fix-archive/, ""),
      },
      "/api/news-aggregator": {
        target: "http://localhost:5013",
        rewrite: (path) => path.replace(/^\/api\/news-aggregator/, ""),
      },
      "/api/fix-gateway": {
        target: "http://localhost:9881",
        rewrite: (path) => path.replace(/^\/api\/fix-gateway/, ""),
      },
    },
  },
});

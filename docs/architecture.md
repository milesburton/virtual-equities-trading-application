# Architecture

## Overview

The Equities Trading Simulator is composed of nine independent services. Each backend service runs as a separate Deno process and communicates over HTTP or WebSocket. A React + Vite frontend provides the trading UI.

## Service Map

```
┌────────────────────────────────────────────────────────────┐
│                     React Frontend  :8080                   │
└──┬──────────────┬────────────────┬──────────────┬──────────┘
   │              │                │              │
   ▼              ▼                ▼              ▼
  OMS           Algo Strategies               Market Sim
  :5002     Limit  :5003          EMS          :5000 (WS)
            TWAP   :5004         :5001
            POV    :5005
            VWAP   :5006
                    │
                    └──────────► EMS :5001

┌────────────────────────────────────────────────────────────┐
│  Observability  :5007  (POST /events · GET /stream SSE)    │
└────────────────────────────────────────────────────────────┘
```

## Services

### Market Simulator (port 5000)
Streams simulated price data over WebSocket using a Geometric Brownian Motion price engine. On each connection it sends an initial `marketData` snapshot then broadcasts a `marketUpdate` every second.

Source: [backend/src/market-sim/market-sim.ts](../backend/src/market-sim/market-sim.ts)
Price logic: [backend/src/market-sim/priceEngine.ts](../backend/src/market-sim/priceEngine.ts)

### Execution Management System — EMS (port 5001)
Accepts trade execution requests from algo strategies and fills them against the live market feed.

Source: [backend/src/ems/ems-server.ts](../backend/src/ems/ems-server.ts)

### Order Management System — OMS (port 5002)
Accepts incoming trade requests from the frontend, assigns a UUID, persists orders, and routes them to the appropriate algo strategy.

Source: [backend/src/oms/oms-server.ts](../backend/src/oms/oms-server.ts)

### Limit Strategy (port 5003)
Connects to the Market Simulator via WebSocket and maintains a queue of pending limit orders. On each price update it checks whether any order's execution condition is met (BUY ≤ limit price, SELL ≥ limit price) or has expired.

Source: [backend/src/algo/limit-strategy.ts](../backend/src/algo/limit-strategy.ts)

### TWAP Strategy (port 5004)
Accepts a trade and executes it in equal-sized slices spread evenly over the order's lifetime using a configurable interval.

Source: [backend/src/algo/twap-strategy.ts](../backend/src/algo/twap-strategy.ts)

### POV Strategy (port 5005)
Accepts a trade and executes a configured percentage of simulated market volume at each interval until the order expires.

Source: [backend/src/algo/pov-strategy.ts](../backend/src/algo/pov-strategy.ts)

### VWAP Strategy (port 5006)
Volume-Weighted Average Price strategy.

Source: [backend/src/algo/vwap-strategy.ts](../backend/src/algo/vwap-strategy.ts)

### Observability (port 5007)
Accepts events via `POST /events` and streams them to subscribers via `GET /stream` (SSE).

Source: [backend/src/observability/observability-server.ts](../backend/src/observability/observability-server.ts)

## Shared Types

All services share the TypeScript interfaces defined in [backend/src/types/types.ts](../backend/src/types/types.ts).

## Process Management

All services are managed by supervisord. In the Dev Container they start automatically on container launch. Use `supervisorctl status` to check service health and `supervisorctl restart <name>` to restart individual services.

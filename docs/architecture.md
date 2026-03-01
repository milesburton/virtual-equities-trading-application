# Architecture

## Overview

The Equities Market Emulator is a backend trading simulation composed of six independent microservices. Each service runs as a separate Deno process and communicates over HTTP or WebSocket. A CLI tool acts as the user-facing entry point and will eventually be replaced by a React/Tailwind frontend.

## Service Map

```
┌─────────────────────────────────────────────────────────────────┐
│                        Trader (CLI / Future UI)                  │
│                     backend/src/cli/trader.ts                    │
└──────────────┬────────────────────────────────┬─────────────────┘
               │  POST /                        │  POST /
               ▼                                ▼
┌──────────────────────────┐     ┌──────────────────────────────┐
│   Order Management       │     │   Algo Strategies            │
│   System (OMS)           │     │                              │
│   :5002                  │     │  Limit  :5003  (HTTP + WS)   │
│   oms/oms-server.ts      │     │  TWAP   :5004  (HTTP)        │
└──────────────────────────┘     │  POV    :5005  (HTTP)        │
                                 └──────────┬───────────────────┘
                                            │  POST /
                                            ▼
                                 ┌──────────────────────────┐
                                 │  Execution Management    │
                                 │  System (EMS)            │
                                 │  :5001                   │
                                 │  ems/ems-server.ts       │
                                 └──────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Market Simulator  :5000  (WebSocket)                        │
│  market-sim/market-sim.ts                                    │
│  Streams: AAPL · TSLA · GBP/USD · EUR/USD  (every 1s)       │
└──────────────────────────────────────────────────────────────┘
        ▲
        │  ws://localhost:5000
        │
┌───────┴──────────────────────────────────────────────────────┐
│  Limit Strategy subscribes to live prices to trigger orders  │
└──────────────────────────────────────────────────────────────┘
```

## Services

### Market Simulator (port 5000)
Streams simulated price data over WebSocket. On each connection it sends an initial `marketData` snapshot, then broadcasts a `marketUpdate` every second. Prices move randomly within ±2% per tick.

Source: [backend/src/market-sim/market-sim.ts](../backend/src/market-sim/market-sim.ts)
Price logic: [backend/src/market-sim/priceEngine.ts](../backend/src/market-sim/priceEngine.ts)

### Execution Management System — EMS (port 5001)
Accepts trade execution requests and calculates total cost. Currently uses static seed prices; does not subscribe to the live market feed.

Source: [backend/src/ems/ems-server.ts](../backend/src/ems/ems-server.ts)

### Order Management System — OMS (port 5002)
Accepts incoming trade requests, assigns a UUID, and acknowledges them. Does not persist orders or forward them automatically.

Source: [backend/src/oms/oms-server.ts](../backend/src/oms/oms-server.ts)

### Limit Strategy (port 5003)
Connects to the Market Simulator via WebSocket and maintains a queue of pending limit orders. On each price update it checks whether any order's execution condition is met (BUY ≤ limit price, SELL ≥ limit price) or has expired, and acts accordingly.

Source: [backend/src/algo/limit-strategy.ts](../backend/src/algo/limit-strategy.ts)

### TWAP Strategy (port 5004)
Accepts a trade and executes it in equal-sized slices spread evenly over the order's lifetime using a configurable interval.

Source: [backend/src/algo/twap-strategy.ts](../backend/src/algo/twap-strategy.ts)

### POV Strategy (port 5005)
Accepts a trade and executes a configured percentage of simulated market volume at each interval until the order expires.

Source: [backend/src/algo/pov-strategy.ts](../backend/src/algo/pov-strategy.ts)

## Data Flow by Strategy

### Limit Order
```
CLI → OMS (queue) → Limit Strategy watches market feed → EMS (execute)
```
Note: The CLI currently routes Limit orders to the OMS rather than the Limit Strategy directly. See [Known Issues](#known-issues).

### TWAP
```
CLI → TWAP Strategy (internal timer slices order) → logs execution
```

### POV
```
CLI → POV Strategy (volume-based slices) → logs execution
```
Note: TWAP and POV currently log execution but do not call EMS. See [Known Issues](#known-issues).

## Shared Types

All services share the TypeScript interfaces defined in [backend/src/types/types.ts](../backend/src/types/types.ts):

```typescript
interface Trade {
  asset: string;
  side: "BUY" | "SELL";
  quantity: number;
  limitPrice: number;
  expiresAt: number;  // seconds from now (CLI input) or Unix ms timestamp (after Limit Algo converts it)
}

interface MarketData {
  asset: string;
  price: number;
  volume: number;
  timestamp: number;
}

interface AlgoStrategy {
  executeTrade(trade: Trade): Promise<void>;
}
```

## Environment Variables

Defined in `.env` (copy from `.env.template`):

| Variable          | Default | Description                        |
|-------------------|---------|------------------------------------|
| `MARKET_SIM_PORT` | 5000    | Market Simulator WebSocket port    |
| `EMS_PORT`        | 5001    | EMS HTTP port                      |
| `OMS_PORT`        | 5002    | OMS HTTP port                      |
| `LIMIT_ALGO_PORT` | 5003    | Limit Strategy HTTP port           |
| `TWAP_ALGO_PORT`  | 5004    | TWAP Strategy HTTP port            |
| `POV_ALGO_PORT`   | 5005    | POV Strategy HTTP port             |
| `TWAP_INTERVAL_MS`| 5000    | Milliseconds between TWAP slices   |
| `POV_PERCENTAGE`  | 10      | % of market volume POV trades      |

## Process Management

All six services are managed by [supervisord](../supervisord.conf). In the Dev Container they start automatically on container launch. Use `supervisorctl status` to check service health and `supervisorctl restart <name>` to restart individual services.

## Known Issues

The following are known gaps in the current implementation:

1. **CLI routes Limit orders to OMS, not the Limit Strategy** — limit orders are accepted but never executed against live prices.
2. **EMS uses static prices** — does not subscribe to the Market Simulator; execution prices are always the seed values.
3. **TWAP/POV do not call EMS** — execution is logged only; no actual EMS call is made.
4. **No persistence** — the PostgreSQL service in `docker-compose.yml` is configured but unused; orders are held in memory only.
5. **Limit Strategy connects to wrong ports** — hardcoded `ws://localhost:8080` and `http://localhost:8081` instead of reading from env.

## Frontend

The `frontend/src/` directory is a placeholder for a planned React + Tailwind UI that will replace the CLI trader.

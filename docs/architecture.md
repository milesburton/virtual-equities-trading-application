# Architecture

## Overview

The Equities Trading Simulator is a multi-service backend connected by a **Redpanda message bus** (Kafka-compatible). The React + Vite frontend connects to a single **API Gateway** — the only service reachable from the browser. All inter-service communication flows through bus topics; no service calls another service directly over HTTP (except the gateway→user-service for auth validation).

## Service Map

```
┌──────────────────────────────────────────────────────────────────┐
│                    React Frontend  :8080                          │
│                 (Vite dev server / Nginx in prod)                 │
└──────────────────────────────┬───────────────────────────────────┘
                               │  WebSocket + HTTP  (single connection)
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                 API Gateway / BFF  :5011                          │
│  • WebSocket hub — pushes market ticks, order events to GUI       │
│  • Proxies GET /assets, /candles, /orders (auth-gated)            │
│  • Publishes orders.new to bus on submitOrder WS message          │
│  • Validates veta_user session cookie via user-service            │
└───────────┬──────────────────┬───────────────────────────────────┘
            │ pub: orders.new  │ sub: market.ticks, orders.*, algo.heartbeat, news.feed
            ▼                  ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│                        Redpanda Message Bus  :9092                                │
│                                                                                   │
│  Topics:  market.ticks · orders.new · orders.submitted · orders.routed            │
│           orders.child · orders.filled · orders.expired · orders.rejected         │
│           algo.heartbeat · user.session · user.access · news.feed · fix.execution │
└──┬────────────┬──────────────┬──────────────────┬────────────────┬───────────────┘
   │            │              │                  │                │
   ▼            ▼              ▼                  ▼                ▼
Market Sim   OMS :5002    Algo Strategies      Journal :5009   Observability :5007
:5000        (orders.new  Limit  :5003         (SQLite audit   (SQLite events
(publishes   → validate   TWAP   :5004          trail +         store, SSE
 market.     → route →    POV    :5005          candle store)   stream to GUI)
 ticks)      orders.      VWAP   :5006
             routed)      (pub orders.child →
                          EMS :5001 →
                          pub orders.filled)
```

**Supporting services (internal only, never reached by the GUI):**

| Service | Port | Role |
|---|---|---|
| User Service | 5008 | Session management, user limits, cookie auth |
| News Aggregator | 5010 | Polls news sources, scores sentiment, publishes news.feed |
| FIX Archive | 5012 | Persists fix.execution reports to SQLite |

## Order Flow

```
GUI (OrderTicket)
  → WS submitOrder → Gateway
  → orders.new (bus)
  → OMS: validates limits, assigns orderId, routes by strategy
  → orders.submitted + orders.routed (bus)
  → Algo (LIMIT / TWAP / POV / VWAP)
  → orders.child per slice (bus)
  → EMS: fills against market price, computes fees, publishes FIX report
  → orders.filled (bus)
  → Gateway: forwards to GUI as orderEvent
  → GUI Redux: fillReceived → order blotter + executions panel
```

Rejected orders (limit violation, expired session, admin role) publish `orders.rejected` to the bus. The OMS and Gateway both emit rejections.

## Services

### API Gateway / BFF (port 5011)
The only service the browser talks to. Maintains a WebSocket hub and fans out all bus events to every connected GUI client. Enforces authentication on all routes via `veta_user` cookie validated against the User Service (10 s cache). Injects `userId` and `userRole` into every order before it reaches the bus.

Source: [backend/src/gateway/gateway.ts](../backend/src/gateway/gateway.ts)

### Market Simulator (port 5000)
Generates simulated prices for ~80 S&P 500 assets using a Geometric Brownian Motion engine. Publishes `market.ticks` to the bus at 4 ticks/second with current prices, volumes, and order book snapshots.

Source: [backend/src/market-sim/market-sim.ts](../backend/src/market-sim/market-sim.ts)
Price engine: [backend/src/market-sim/priceEngine.ts](../backend/src/market-sim/priceEngine.ts)
Asset universe: [backend/src/market-sim/sp500Assets.ts](../backend/src/market-sim/sp500Assets.ts)

### Order Management System — OMS (port 5002)
Subscribes to `orders.new`. Validates each order against the submitting user's trading limits (max qty, max daily notional, allowed strategies). Rejects admin users from trading. Routes accepted orders to the appropriate algo strategy by publishing `orders.submitted` and `orders.routed`.

Source: [backend/src/oms/oms-server.ts](../backend/src/oms/oms-server.ts)

### Algo Strategies (ports 5003–5006)
Each strategy subscribes to `orders.routed` and handles orders matching its strategy tag. When it's time to execute a slice it publishes `orders.child` for the EMS to fill.

| Strategy | Port | Logic |
|---|---|---|
| Limit | 5003 | Watches market price; fires when price crosses limit |
| TWAP | 5004 | Equal-sized slices spread evenly over order lifetime |
| POV | 5005 | Executes a % of simulated market volume per interval |
| VWAP | 5006 | Tracks rolling VWAP; slices weighted by volume profile |

Sources: [backend/src/algo/](../backend/src/algo/)

### Execution Management System — EMS (port 5001)
Subscribes to `orders.child`. Simulates market microstructure: picks a venue (XNAS, XNYS, ARCX, …), counterparty, and liquidity flag (MAKER/TAKER/CROSS). Computes fill price with market impact, SEC fee, FINRA TAF, and commission. Publishes `orders.filled` and `fix.execution`.

Source: [backend/src/ems/ems-server.ts](../backend/src/ems/ems-server.ts)

### Journal (port 5009)
Dual-purpose SQLite service:
- **Audit trail**: Subscribes to all order, user, and access topics; persists every event with 90-day retention. Exposes `GET /journal` for filtering and `GET /orders` for UI hydration.
- **Candle store**: Subscribes to `market.ticks`; aggregates OHLCV candles at 1-minute and 5-minute intervals (capped at 120 per instrument). Exposes `GET /candles`.

Source: [backend/src/journal/journal-server.ts](../backend/src/journal/journal-server.ts)

### Observability (port 5007)
Subscribes to all bus topics (excluding high-frequency market ticks). Persists events to SQLite with 24-hour retention. Streams events to the frontend Observability panel via SSE (`GET /stream`). Also accepts `POST /events` for client-side events (login, logout, order attempts) that don't flow through the bus. Exposes `GET /health/all` for aggregate service health.

Source: [backend/src/observability/observability-server.ts](../backend/src/observability/observability-server.ts)

### User Service (port 5008)
Manages user accounts, session tokens (`veta_user` cookie), and per-user trading limits. Used internally by the Gateway (token validation) and OMS (limit lookup). Not directly reachable from the browser.

Source: [backend/src/user-service/user-service.ts](../backend/src/user-service/user-service.ts)

### News Aggregator (port 5010)
Polls configured news sources, extracts ticker mentions, scores sentiment (positive/negative/neutral), and publishes `news.feed` events to the bus. The Gateway forwards these to the GUI as `newsUpdate` WebSocket events.

Source: [backend/src/news/news-aggregator.ts](../backend/src/news/news-aggregator.ts)

### FIX Archive (port 5012)
Subscribes to `fix.execution` events and persists them to SQLite in FIX 4.4 format. Exposes `GET /fix/executions` for historical execution report queries.

Source: [backend/src/fix-archive/fix-archive.ts](../backend/src/fix-archive/fix-archive.ts)

## Frontend Architecture

The React frontend (Vite + Redux Toolkit) uses a single `gatewayMiddleware` for all backend communication. On start it opens a WebSocket to the gateway and keeps it alive with exponential-backoff reconnection.

Key middleware:
- **gatewayMiddleware** — WS connection, dispatches all inbound events, sends orders
- **observabilityMiddleware** — intercepts Redux actions (login, logout, order attempt) and POSTs them to the observability service
- **simulationMiddleware** — local fill simulation for disconnected / demo mode only (gated on `market.connected`)
- **versionWatchMiddleware** — detects backend version changes and notifies the user

## Authentication

Session tokens are stored as `veta_user` HTTP-only cookies set by the User Service on login. The Gateway validates the token on every WS connection and every HTTP proxy request. Token lookups are cached for 10 seconds. Admin users can view all panels but are blocked from submitting orders at both the OMS level (bus) and the UI level (OrderTicket hidden for admin role).

## Process Management

All services are managed by **supervisord**. In the Dev Container they start automatically on launch.

```bash
supervisorctl -c /home/deno/supervisord.conf status        # check all
supervisorctl -c /home/deno/supervisord.conf restart <svc> # restart one
```

Service names: `market-sim`, `ems`, `oms`, `algo-trader`, `twap-algo`, `pov-algo`, `vwap-algo`, `observability`, `user-service`, `journal`, `news-aggregator`, `fix-archive`, `gateway`

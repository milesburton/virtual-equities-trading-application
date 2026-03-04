# Equities Trading Simulator

**Live demo:** https://virtual-equities-trading.fly.dev/

A simulated equities trading environment comprising a market price engine, execution and order management systems, four algorithmic trading strategies, an observability service, and a React frontend.

## Documentation

- [Architecture & service map](docs/architecture.md)
- [API reference](docs/api/)

## Project Structure

```
backend/
  src/
    market-sim/       Price engine and WebSocket feed
    ems/              Execution Management System
    oms/              Order Management System
    algo/             Limit, TWAP, POV, and VWAP strategy servers
    observability/    Event ingestion and SSE streaming
    lib/              Shared utilities
    types/            Shared type definitions
    tests/            Unit, integration, and smoke tests
  .env.template       Environment variable reference

frontend/             React + Vite + TypeScript trading UI
  src/
    components/       UI panels (OrderTicket, MarketLadder, OrderBlotter, etc.)
    store/            Redux Toolkit slices, RTK Query APIs, and middleware
    hooks/            usePopOut
    context/          TradingContext (DOM focus only)

docs/
  architecture.md
  api/

.devcontainer/        Dev Container definition
```

## Getting Started

The project is designed to run inside a [Dev Container](https://containers.dev/). Opening it in VS Code with the Dev Containers extension will provision all dependencies and start all services automatically.

```
Ctrl+Shift+P → Dev Containers: Rebuild and Reopen in Container
```

To configure ports or tuning parameters, copy the template before the container starts:

```sh
cp .env.template .env
```

## Backend

All backend services are written in Deno. Tasks are defined in `deno.json` at the repository root.

```sh
deno task lint          # Lint backend source
deno task check         # Type-check backend source
deno task test:unit     # Run unit tests
deno task test:smoke    # Run smoke tests (requires running services)
deno task all           # lint → check → test:unit
```

## Frontend

The frontend is a React + Vite application in `frontend/`.

```sh
cd frontend
npm run dev           # Start dev server on port 8080
npm run build         # Type-check and build for production
npm run typecheck     # Type-check without emitting
npm run lint          # Run Biome linter
npm run test:unit     # Run Vitest unit tests
```

### Playwright UI tests

```sh
npm run test:ui           # Headless
npm run test:ui:headed    # With visible browser
```

## Deployment

See [docs/deployment.md](docs/deployment.md) for Fly.io deployment instructions.

## Licence

MIT Licence &copy; 2025 Miles Burton

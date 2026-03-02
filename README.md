# Equities Market Emulator

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
  supervisord.conf    Process manager configuration (used inside Dev Container)

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
scripts/              Git hook installer
```

## Getting Started

The project is designed to run inside a [Dev Container](https://containers.dev/). Opening it in VS Code with the Dev Containers extension will provision all dependencies and start all services automatically via supervisord.

```
Ctrl+Shift+P → Dev Containers: Rebuild and Reopen in Container
```

To configure ports or tuning parameters, copy the template before the container starts:

```sh
cp backend/.env.template backend/.env
```

Key defaults:

| Variable | Default | Description |
|---|---|---|
| `MARKET_SIM_PORT` | 5000 | Market price WebSocket and HTTP feed |
| `EMS_PORT` | 5001 | Execution Management System |
| `OMS_PORT` | 5002 | Order Management System |
| `ALGO_TRADER_PORT` | 5003 | Limit strategy |
| `TWAP_ALGO_PORT` | 5004 | TWAP strategy |
| `POV_ALGO_PORT` | 5005 | POV strategy |
| `VWAP_ALGO_PORT` | 5006 | VWAP strategy |
| `FRONTEND_PORT` | 8080 | React UI |

## Services

All nine services are managed by supervisord inside the Dev Container:

| Service | Port | Description |
|---|---|---|
| `market-sim` | 5000 | Simulates price movements; broadcasts ticks over WebSocket |
| `ems` | 5001 | Fills orders against simulated market volume |
| `oms` | 5002 | Receives and persists orders |
| `algo-trader` | 5003 | Limit order strategy |
| `twap-algo` | 5004 | Time-Weighted Average Price strategy |
| `pov-algo` | 5005 | Percentage of Volume strategy |
| `vwap-algo` | 5006 | Volume-Weighted Average Price strategy |
| `observability` | 5007 | Event ingestion (POST /events) and SSE stream (GET /events) |
| `frontend` | 8080 | React trading UI |

Check service status:

```sh
supervisorctl status
```

Restart a service:

```sh
supervisorctl restart market-sim
```

Tail logs:

```sh
supervisorctl tail -f market-sim
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

The frontend is a React + Vite application in `frontend/`. It uses Redux Toolkit for state, RTK Query for service health polling, and Preact signals for component-local state.

```sh
cd frontend
npm ci

npm run dev           # Start dev server on port 8080
npm run build         # Type-check and build for production
npm run typecheck     # Type-check without emitting
npm run lint          # Run Biome linter
npm run lint:fix      # Run Biome linter with auto-fix
npm run test:unit     # Run Vitest unit tests
```

### Playwright UI tests

```sh
npx playwright install --with-deps
npm run build
npm run test:ui           # Headless
npm run test:ui:headed    # With visible browser
```

### Test coverage

```sh
npm run test:unit -- --run --coverage
```

## Git Hooks

Install once after cloning:

```sh
sh scripts/install-hooks.sh
```

Hooks enforce Biome linting, TypeScript type-checking, Deno backend tests, and [Conventional Commits](https://www.conventionalcommits.org/) on every commit.

Commit message format: `<type>(scope): <description>`

Allowed types: `feat` `fix` `docs` `style` `refactor` `perf` `test` `chore` `build` `ci` `revert`

## Licence

MIT Licence &copy; 2025 Miles Burton

# Order Management System (OMS)

**Port:** 5002
**Source:** [backend/src/oms/oms-server.ts](../../backend/src/oms/oms-server.ts)

## Overview

The OMS is a **bus-driven** service. It does not accept HTTP order submissions. All order intake flows through Redpanda:

- **Subscribes to:** `orders.new`
- **Publishes:** `orders.submitted`, `orders.routed`, `orders.rejected`

The GUI submits orders to the **Gateway** via WebSocket (`submitOrder` message). The Gateway publishes to `orders.new` with the user's identity attached. The OMS picks up each order, validates it, and routes it to the appropriate algo strategy.

## Order Validation

For each `orders.new` message the OMS:

1. Rejects orders from `userRole === "admin"` — admin users cannot trade
2. Fetches the user's trading limits from the User Service (30 s cache)
3. Validates `quantity ≤ max_order_qty`
4. Validates `quantity × limitPrice ≤ max_daily_notional`
5. Validates `strategy` is in the user's `allowed_strategies` list

Failed validation publishes `orders.rejected` with a `reason` field. Accepted orders are published to `orders.submitted` (full order record) and `orders.routed` (with a `routedTo` field indicating the target algo).

## HTTP Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Returns `{ service, version, status }` |

No other HTTP endpoints exist. The OMS exposes only a health check.

## Order Routing

Strategy is determined by `order.strategy`:

| Value | Handled by |
|---|---|
| `LIMIT` | Limit Strategy (port 5003) |
| `TWAP` | TWAP Strategy (port 5004) |
| `POV` | POV Strategy (port 5005) |
| `VWAP` | VWAP Strategy (port 5006) |

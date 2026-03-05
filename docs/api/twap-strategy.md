# TWAP Strategy

**Port:** 5004
**Source:** [backend/src/algo/twap-strategy.ts](../../backend/src/algo/twap-strategy.ts)

## Overview

Bus-driven Time-Weighted Average Price algo strategy.

- **Subscribes to:** `orders.routed` (filters `strategy === "TWAP"`)
- **Publishes:** `orders.child`, `orders.expired`, `algo.heartbeat`

On receiving a TWAP order, the strategy divides the total quantity into equal slices and schedules them at regular intervals across the order's lifetime. Each slice becomes an `orders.child` message for the EMS to fill. The order expires when either all slices have been sent or `expiresAt` is reached.

Slice interval defaults to `algoParams.sliceIntervalMs` if provided, otherwise calculated as `(expiresAt - now) / numSlices`.

## HTTP Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Returns `{ service, version, status, activeOrders }` |

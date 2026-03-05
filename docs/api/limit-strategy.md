# Limit Strategy

**Port:** 5003
**Source:** [backend/src/algo/limit-strategy.ts](../../backend/src/algo/limit-strategy.ts)

## Overview

Bus-driven algo strategy for limit orders.

- **Subscribes to:** `orders.routed` (filters `strategy === "LIMIT"`), `market.ticks`
- **Publishes:** `orders.child`, `orders.expired`, `algo.heartbeat`

On each market tick the strategy checks all held limit orders. If the current market price satisfies the limit condition (BUY: price ≤ limitPrice; SELL: price ≥ limitPrice), it publishes a single `orders.child` for the EMS to fill. Orders past their `expiresAt` timestamp are published as `orders.expired`.

## HTTP Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Returns `{ service, version, status, heldOrders }` |

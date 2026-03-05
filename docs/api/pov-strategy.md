# POV Strategy (Percentage of Volume)

**Port:** 5005
**Source:** [backend/src/algo/pov-strategy.ts](../../backend/src/algo/pov-strategy.ts)

## Overview

Bus-driven Percentage-of-Volume algo strategy.

- **Subscribes to:** `orders.routed` (filters `strategy === "POV"`), `market.ticks`
- **Publishes:** `orders.child`, `orders.expired`, `algo.heartbeat`

On each market tick the strategy calculates the simulated market volume for the asset and submits a slice equal to `algoParams.povRate` (default 10%) of that volume, up to the order's remaining quantity. This participates proportionally in market activity rather than on a fixed schedule.

## HTTP Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Returns `{ service, version, status, activeOrders }` |

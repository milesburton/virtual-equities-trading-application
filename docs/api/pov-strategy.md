# POV Strategy

**Port:** `5005` (env: `POV_ALGO_PORT`)
**Protocol:** HTTP
**Source:** [backend/src/algo/pov-strategy.ts](../../backend/src/algo/pov-strategy.ts)

## Overview

Implements a Percentage of Volume (POV) execution strategy. The service simulates a market volume reading every 5 seconds and executes a configured percentage of that volume until the order lifetime (`expiresAt`) elapses.

**Slice formula:**
```
sliceSize = (POV_PERCENTAGE / 100) × simulatedMarketVolume
```

Market volume is currently simulated as a random number between 0 and 1000.

## Configuration

| Env Variable    | Default | Description                                   |
|-----------------|---------|-----------------------------------------------|
| `POV_ALGO_PORT` | 5005    | HTTP port the service listens on              |
| `POV_PERCENTAGE`| 10      | Percentage of market volume to execute (0–100)|

## Endpoints

### POST /

Start POV execution of a trade. The response is returned immediately; execution continues asynchronously.

**Request body**

```json
{
  "asset": "AAPL",
  "side": "BUY",
  "quantity": 500,
  "limitPrice": 150.00,
  "expiresAt": 60
}
```

| Field        | Type               | Description                               |
|--------------|--------------------|-------------------------------------------|
| `asset`      | string             | Ticker symbol                             |
| `side`       | `"BUY"` \| `"SELL"` | Trade direction                          |
| `quantity`   | number             | Total units to execute (upper bound)      |
| `limitPrice` | number             | Reference price (informational only)      |
| `expiresAt`  | number             | Order lifetime in seconds                 |

**Response — 200 OK**

```
POV Execution Started
```

**Response — 405 Method Not Allowed**

Returned for any non-POST request.

**Response — 500 Internal Server Error**

Returned if the request body cannot be parsed as JSON.

## Example

```sh
curl -X POST http://localhost:5005 \
  -H "Content-Type: application/json" \
  -d '{"asset":"AAPL","side":"BUY","quantity":500,"limitPrice":150,"expiresAt":60}'
```

## Notes

- Market volume is simulated internally with `Math.random() * 1000`; it does not read from the Market Simulator.
- Execution is currently logged only. The service does not call the EMS to record executed slices.
- The loop iterates `expiresAt / 5` times (one iteration per 5 seconds). Each iteration sleeps for 5 000 ms.
- Multiple concurrent POV orders are supported (each runs in its own async loop).

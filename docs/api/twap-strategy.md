# TWAP Strategy

**Port:** `5004` (env: `TWAP_ALGO_PORT`)
**Protocol:** HTTP
**Source:** [backend/src/algo/twap-strategy.ts](../../backend/src/algo/twap-strategy.ts)

## Overview

Implements a Time-Weighted Average Price (TWAP) execution strategy. The total order quantity is divided into equal-sized slices and executed at a fixed time interval until the full quantity is filled.

**Slice size formula:**
```
sliceSize = quantity / (expiresAt / (INTERVAL_MS / 1000))
```

Where `expiresAt` is the order lifetime in seconds and `INTERVAL_MS` is the configured interval in milliseconds.

## Configuration

| Env Variable       | Default | Description                          |
|--------------------|---------|--------------------------------------|
| `TWAP_ALGO_PORT`   | 5004    | HTTP port the service listens on     |
| `TWAP_INTERVAL_MS` | 5000    | Milliseconds between execution slices|

## Endpoints

### POST /

Start TWAP execution of a trade. The response is returned immediately; execution continues asynchronously.

**Request body**

```json
{
  "asset": "AAPL",
  "side": "BUY",
  "quantity": 100,
  "limitPrice": 150.00,
  "expiresAt": 60
}
```

| Field        | Type               | Description                               |
|--------------|--------------------|-------------------------------------------|
| `asset`      | string             | Ticker symbol                             |
| `side`       | `"BUY"` \| `"SELL"` | Trade direction                          |
| `quantity`   | number             | Total units to execute                    |
| `limitPrice` | number             | Reference price (informational only)      |
| `expiresAt`  | number             | Order lifetime in seconds                 |

**Response — 200 OK**

```
TWAP Execution Started
```

**Response — 405 Method Not Allowed**

Returned for any non-POST request.

**Response — 500 Internal Server Error**

Returned if the request body cannot be parsed as JSON.

## Example

```sh
curl -X POST http://localhost:5004 \
  -H "Content-Type: application/json" \
  -d '{"asset":"AAPL","side":"BUY","quantity":100,"limitPrice":150,"expiresAt":60}'
```

## Notes

- Execution is currently logged only. The service does not call the EMS to record executed slices.
- Multiple concurrent TWAP orders are supported (each runs in its own async loop).

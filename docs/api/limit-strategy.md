# Limit Strategy

**Port:** `5003` (env: `LIMIT_ALGO_PORT`)
**Protocol:** HTTP (accepts orders) + WebSocket (consumes market feed)
**Source:** [backend/src/algo/limit-strategy.ts](../../backend/src/algo/limit-strategy.ts)

## Overview

Implements a limit order execution strategy. On startup it connects to the Market Simulator WebSocket and subscribes to live price updates. Incoming orders are queued; on each price tick the service checks whether any queued order's execution condition is satisfied or has expired.

**Execution conditions:**
- `BUY` order executes when `marketPrice <= limitPrice`
- `SELL` order executes when `marketPrice >= limitPrice`

Expired orders (where `Date.now() >= expiresAt`) are cancelled and removed from the queue.

## Endpoints

### POST /

Submit a limit order for queued execution.

**Request body**

```json
{
  "asset": "AAPL",
  "side": "BUY",
  "quantity": 10,
  "limitPrice": 148.00,
  "expiresAt": 300
}
```

| Field        | Type               | Description                                            |
|--------------|--------------------|--------------------------------------------------------|
| `asset`      | string             | Ticker symbol                                          |
| `side`       | `"BUY"` \| `"SELL"` | Trade direction                                      |
| `quantity`   | number             | Number of units                                        |
| `limitPrice` | number             | Price threshold for execution                          |
| `expiresAt`  | number             | Seconds from now until the order expires               |

The service converts `expiresAt` from seconds to an absolute Unix timestamp (`Date.now() + expiresAt * 1000`) before queuing.

**Response — 200 OK**

```json
{ "success": true, "message": "Trade request queued." }
```

**Response — 400 Bad Request**

```json
{ "success": false, "message": "Invalid trade request." }
```

### GET /

Returns a plain-text health check response: `Limit Order Algo Running`.

## Example

```sh
curl -X POST http://localhost:5003 \
  -H "Content-Type: application/json" \
  -d '{"asset":"AAPL","side":"BUY","quantity":10,"limitPrice":148.00,"expiresAt":300}'
```

## Notes

- **Known issue:** The service currently connects to `ws://localhost:8080` and routes executions to `http://localhost:8081` (hardcoded). These should read from `MARKET_SIM_PORT` and `EMS_PORT` env vars respectively.
- Orders are stored in-process memory. They are lost if the service restarts.
- The CLI currently sends Limit orders to the OMS (port 5002) rather than directly to this service (port 5003).

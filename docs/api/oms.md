# Order Management System (OMS)

**Port:** `5002` (env: `OMS_PORT`)
**Protocol:** HTTP
**Source:** [backend/src/oms/oms-server.ts](../../backend/src/oms/oms-server.ts)

## Overview

Accepts incoming trade requests, assigns a unique trade ID, and returns an acknowledgement. Orders are held in memory only and are not forwarded to the EMS or any algo strategy automatically.

## Endpoints

### POST /

Submit a new trade order.

**Request body**

```json
{
  "asset": "AAPL",
  "side": "BUY",
  "quantity": 10,
  "limitPrice": 148.50,
  "expiresAt": 300
}
```

| Field        | Type               | Description                              |
|--------------|--------------------|------------------------------------------|
| `asset`      | string             | Ticker symbol (`AAPL`, `TSLA`, `GBP/USD`, `EUR/USD`) |
| `side`       | `"BUY"` \| `"SELL"` | Trade direction                         |
| `quantity`   | number             | Number of units                          |
| `limitPrice` | number             | Target execution price                   |
| `expiresAt`  | number             | Seconds until the order expires          |

**Response — 200 OK**

```json
{
  "status": "accepted",
  "tradeId": "3f1b2c4d-...",
  "asset": "AAPL",
  "side": "BUY",
  "quantity": 10,
  "limitPrice": 148.50,
  "expiresAt": 300
}
```

**Response — 405 Method Not Allowed**

Returned for any non-POST request.

**Response — 500 Internal Server Error**

Returned if the request body cannot be parsed as JSON.

## Example

```sh
curl -X POST http://localhost:5002 \
  -H "Content-Type: application/json" \
  -d '{"asset":"AAPL","side":"BUY","quantity":10,"limitPrice":148.50,"expiresAt":300}'
```

## Notes

- Orders are not persisted; they are lost on service restart.
- The OMS does not validate the asset against the market simulator's known assets.

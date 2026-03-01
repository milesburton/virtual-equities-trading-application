# Execution Management System (EMS)

**Port:** `5001` (env: `EMS_PORT`)
**Protocol:** HTTP
**Source:** [backend/src/ems/ems-server.ts](../../backend/src/ems/ems-server.ts)

## Overview

Executes trade requests at the current market price. Calculates and returns the total cost of the trade. Currently uses static seed prices rather than live data from the Market Simulator.

## Endpoints

### POST /

Execute a trade immediately at the current (static) price.

**Request body**

```json
{
  "asset": "AAPL",
  "side": "BUY",
  "quantity": 10
}
```

| Field      | Type               | Description                              |
|------------|--------------------|------------------------------------------|
| `asset`    | string             | Ticker symbol (`AAPL`, `TSLA`, `GBP/USD`, `EUR/USD`) |
| `side`     | `"BUY"` \| `"SELL"` | Trade direction                         |
| `quantity` | number             | Number of units to execute               |

**Response — 200 OK**

```json
{
  "success": true,
  "message": "Trade executed: BUY 10 AAPL at 150",
  "price": 150,
  "totalCost": 1500
}
```

**Response — 400 Bad Request**

Returned when the requested asset is not recognised.

```json
{ "success": false, "message": "Invalid asset" }
```

**Response — 405 Method Not Allowed**

Returned for any non-POST request.

## Example

```sh
curl -X POST http://localhost:5001 \
  -H "Content-Type: application/json" \
  -d '{"asset":"AAPL","side":"BUY","quantity":10}'
```

## Notes

- Prices are hardcoded seed values (`AAPL: 150`, `TSLA: 850`, `GBP/USD: 1.35`, `EUR/USD: 1.12`). The EMS does not subscribe to the Market Simulator, so execution prices do not reflect live market movements.
- `totalCost` is always `quantity × seed price`.

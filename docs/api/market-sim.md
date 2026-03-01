# Market Simulator

**Port:** `5000` (env: `MARKET_SIM_PORT`)
**Protocol:** WebSocket
**Source:** [backend/src/market-sim/market-sim.ts](../../backend/src/market-sim/market-sim.ts)

## Overview

Streams simulated market price data for four assets in real time. Every connected client receives an initial snapshot then live updates once per second.

## Assets Simulated

| Asset     | Seed Price |
|-----------|-----------|
| AAPL      | 150.00    |
| TSLA      | 850.00    |
| GBP/USD   | 1.35      |
| EUR/USD   | 1.12      |

Price movements are random within ±2% of the current price per tick, implemented in [priceEngine.ts](../../backend/src/market-sim/priceEngine.ts).

## WebSocket Protocol

**Connect:** `ws://localhost:5000`

### Server → Client Messages

#### Initial snapshot (on connect)

```json
{
  "event": "marketData",
  "data": {
    "AAPL": 150.0,
    "TSLA": 850.0,
    "GBP/USD": 1.35,
    "EUR/USD": 1.12
  }
}
```

#### Live update (every 1 second)

```json
{
  "event": "marketUpdate",
  "data": {
    "AAPL": 151.23,
    "TSLA": 847.56,
    "GBP/USD": 1.348,
    "EUR/USD": 1.122
  }
}
```

### Client → Server Messages

Inbound messages are logged but produce no response.

## Example (wscat)

```sh
wscat -c ws://localhost:5000
```

## Notes

- All clients share the same underlying price state — prices evolve globally, not per-connection.
- Disconnecting a client clears its update interval to avoid memory leaks.

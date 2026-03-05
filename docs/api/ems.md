# Execution Management System (EMS)

**Port:** 5001
**Source:** [backend/src/ems/ems-server.ts](../../backend/src/ems/ems-server.ts)

## Overview

The EMS is a **bus-driven** service. It does not accept HTTP order submissions.

- **Subscribes to:** `orders.child`
- **Publishes:** `orders.filled`, `fix.execution`

Algo strategies publish child orders to `orders.child` when it is time to execute a slice. The EMS simulates realistic market microstructure for each child and publishes the fill result.

## Fill Simulation

For each `orders.child` message the EMS:

1. Picks a venue (XNAS, XNYS, ARCX, BATS, EDGX, IEX, MEMX) weighted by realistic market share
2. Picks a counterparty (GSCO, MSCO, JPMS, BAML, CITI, UBSS, DBSI, BARX, MKTX, VIRX, CITD, SUSG, GETC, JNST, TWOC)
3. Assigns a liquidity flag: MAKER (40%), TAKER (55%), CROSS (5%)
4. Computes market impact in bps based on order size vs. ADV
5. Applies slippage to derive `avgFillPrice`
6. Calculates fees: commission per share (rebate for MAKER, charge for TAKER), SEC fee, FINRA TAF
7. Computes T+2 settlement date (skipping weekends)

## Published Payload (`orders.filled`)

```ts
{
  execId: string;          // unique execution ID
  childId: string;         // ID of the child order
  parentOrderId: string;   // parent order ID
  clientOrderId: string;   // GUI-facing order ID
  algo: string;
  asset: string;
  side: "BUY" | "SELL";
  requestedQty: number;
  filledQty: number;
  remainingQty: number;
  avgFillPrice: number;
  midPrice: number;
  marketImpactBps: number;
  venue: VenueMIC;
  counterparty: string;
  liquidityFlag: "MAKER" | "TAKER" | "CROSS";
  commissionUSD: number;
  secFeeUSD: number;
  finraTafUSD: number;
  totalFeeUSD: number;
  settlementDate: string;  // YYYY-MM-DD
  ts: number;
}
```

## HTTP Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Returns `{ service, version, status }` |

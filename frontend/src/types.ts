export interface AssetDef {
  symbol: string;
  initialPrice: number;
  volatility: number;
  sector: string;
  // ── Enriched reference data (populated by market-sim /assets endpoint) ──────
  dailyVolume?: number;
  marketCapB?: number;
  beta?: number;
  dividendYield?: number;
  peRatio?: number;
  float?: number;
  exchange?: string;
  currency?: string;
  isin?: string;
}

export interface MarketPrices {
  [asset: string]: number;
}

export interface PriceHistory {
  [asset: string]: number[];
}

export interface OhlcCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface OrderBookSnapshot {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  mid: number;
  ts: number;
}

export interface CandleHistory {
  [asset: string]: { "1m": OhlcCandle[]; "5m": OhlcCandle[] };
}

export type OrderStatus = "queued" | "executing" | "filled" | "expired" | "rejected";
export type Strategy = "LIMIT" | "TWAP" | "POV" | "VWAP";

/** FIX Time In Force (tag 59). */
export type TimeInForce = "DAY" | "GTC" | "IOC" | "FOK" | "GTD";

/** Whether this fill added (maker) or removed (taker) liquidity. */
export type LiquidityFlag = "MAKER" | "TAKER" | "CROSS";

/** Execution venue MIC code. */
export type VenueMIC = "XNAS" | "XNYS" | "XCHI" | "ARCX" | "BATS" | "EDGX" | "IEX" | "MEMX";

export interface LimitParams {
  strategy: "LIMIT";
}

export interface TwapParams {
  strategy: "TWAP";
  numSlices: number;
  participationCap: number;
}

export interface PovParams {
  strategy: "POV";
  participationRate: number;
  minSliceSize: number;
  maxSliceSize: number;
}

export interface VwapParams {
  strategy: "VWAP";
  maxDeviation: number;
  startOffsetSecs: number;
  endOffsetSecs: number;
}

export type AlgoParams = LimitParams | TwapParams | PovParams | VwapParams;

export interface Trade {
  asset: string;
  side: "BUY" | "SELL";
  quantity: number;
  limitPrice: number;
  expiresAt: number;
  algoParams: AlgoParams;
}

export interface ChildOrder {
  id: string;
  parentId: string;
  asset: string;
  side: "BUY" | "SELL";
  quantity: number;
  limitPrice: number;
  status: OrderStatus;
  filled: number;
  submittedAt: number;
  // ── Execution enrichment ─────────────────────────────────────────────────────
  /** Average fill price for filled child orders. */
  avgFillPrice?: number;
  /** Market impact in basis points for this child execution. */
  marketImpactBps?: number;
  /** Which venue executed this child. */
  venue?: VenueMIC;
  /** Counterparty MPID (market participant ID) from the simulated exchange. */
  counterparty?: string;
  /** Whether this fill was maker (passive) or taker (aggressive). */
  liquidityFlag?: LiquidityFlag;
  /** Commission charged in USD. */
  commissionUSD?: number;
  /** Settlement date as ISO date string (T+2 for equities). */
  settlementDate?: string;
}

export interface OrderRecord {
  id: string;
  submittedAt: number;
  asset: string;
  side: "BUY" | "SELL";
  quantity: number;
  limitPrice: number;
  expiresAt: number;
  strategy: Strategy;
  status: OrderStatus;
  filled: number;
  algoParams: AlgoParams;
  children: ChildOrder[];
  // ── Enriched order metadata ──────────────────────────────────────────────────
  /** FIX Time In Force for this order. Derived from expiresAt duration. */
  timeInForce?: TimeInForce;
  /** Destination venue (may differ from execution venue after smart routing). */
  destinationVenue?: VenueMIC;
  /** Weighted average fill price across all child executions. */
  avgFillPrice?: number;
  /** Total commission charged in USD (sum of child commissions). */
  totalCommissionUSD?: number;
  /** Total market impact cost in USD. */
  marketImpactUSD?: number;
  /** Client account identifier (from order ticket). */
  accountId?: string;
  /** Executing broker / prime broker identifier. */
  brokerId?: string;
  /** T+2 settlement date (set when status transitions to filled). */
  settlementDate?: string;
  /** Client order notes / free text. */
  notes?: string;
}

export interface ObsEvent {
  type: string;
  ts?: number;
  payload?: Record<string, unknown>;
}

export type ServiceState = "ok" | "error" | "unknown";

export interface ServiceHealth {
  name: string;
  url: string;
  link?: string;
  /** If true, an error state does not affect the aggregate status indicator */
  optional?: boolean;
  state: ServiceState;
  version: string;
  meta: Record<string, unknown>;
  lastChecked: number | null;
}

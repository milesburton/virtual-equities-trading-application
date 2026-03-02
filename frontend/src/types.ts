export interface AssetDef {
  symbol: string;
  initialPrice: number;
  volatility: number;
  sector: string;
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
}

export interface CandleHistory {
  [asset: string]: { "1m": OhlcCandle[]; "5m": OhlcCandle[] };
}

export type OrderStatus = "queued" | "executing" | "filled" | "expired";
export type Strategy = "LIMIT" | "TWAP" | "POV" | "VWAP";

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
  state: ServiceState;
  version: string;
  meta: Record<string, unknown>;
  lastChecked: number | null;
}

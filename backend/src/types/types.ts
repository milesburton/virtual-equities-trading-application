export interface Trade {
    asset: string;
    side: "BUY" | "SELL";
    quantity: number;
    limitPrice: number;
    expiresAt: number;
  }
  
  export interface MarketData {
    asset: string;
    price: number;
    volume: number;
    timestamp: number;
  }
  
  export interface AlgoStrategy {
    executeTrade(trade: Trade): Promise<void>;
  }

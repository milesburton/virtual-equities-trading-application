import type { ChannelNumber } from "../../store/channelsSlice.ts";

export type { ChannelNumber };

export const CHANNEL_COLOURS: Record<ChannelNumber, { hex: string; tw: string; label: string }> = {
  1: { hex: "#3b82f6", tw: "blue", label: "Blue" },
  2: { hex: "#22c55e", tw: "green", label: "Green" },
  3: { hex: "#eab308", tw: "yellow", label: "Yellow" },
  4: { hex: "#ef4444", tw: "red", label: "Red" },
  5: { hex: "#a855f7", tw: "purple", label: "Purple" },
  6: { hex: "#f97316", tw: "orange", label: "Orange" },
};

export const PANEL_IDS = [
  "market-ladder",
  "order-ticket",
  "order-blotter",
  "algo-monitor",
  "observability",
  "candle-chart",
  "market-depth",
  "executions",
  "decision-log",
  "market-match",
  "admin",
  "news",
  "news-sources",
  "order-progress",
  "market-heatmap",
] as const;

export type PanelId = (typeof PANEL_IDS)[number];

export const PANEL_TITLES: Record<PanelId, string> = {
  "market-ladder": "Market Ladder (live quotes)",
  "order-ticket": "Order Ticket (place trades)",
  "order-blotter": "Orders (active & filled)",
  "algo-monitor": "Algo Monitor (strategy status)",
  observability: "Observability (system health)",
  "candle-chart": "Price Chart (OHLC history)",
  "market-depth": "Market Depth (bid/ask book)",
  executions: "Executions (trade fills)",
  "decision-log": "Decision Log (algo audit trail)",
  "market-match": "Market Match (trade tape)",
  admin: "Mission Control (system config)",
  news: "News & Signals (market analysis)",
  "news-sources": "News Sources (mission control)",
  "order-progress": "Order Progress (fill tracker)",
  "market-heatmap": "Market Heatmap (sector view)",
};

export const PANEL_DESCRIPTIONS: Record<PanelId, string> = {
  "market-ladder":
    "Live asset quotes — click a row to select and broadcast the symbol to linked panels",
  "order-ticket":
    "Submit buy/sell orders — receives the selected symbol from a linked Market Ladder",
  "order-blotter": "History of submitted orders with status, fill price, and P&L",
  "algo-monitor": "Monitor running algorithmic strategies and their real-time state",
  observability: "System health metrics — latency, throughput, and service status",
  "candle-chart":
    "OHLC candlestick chart with volume — receives the selected symbol from a linked panel",
  "market-depth": "Level 2 order book — bid/ask depth ladder for the selected symbol",
  executions: "Real-time trade execution feed — fills, partial fills, and rejections",
  "decision-log": "Audit trail of algo decision events — signals, triggers, and reasoning",
  "market-match": "Live matched trade tape — recent prints for the selected symbol",
  admin: "Mission Control — system configuration and user management",
  news: "Live market news with sentiment scoring — signals for algo strategies",
  "news-sources":
    "Enable or disable news feed sources for the aggregator service — mission control only",
  "order-progress":
    "Pie charts showing fill progress per active order, plus avg fill rate by strategy",
  "market-heatmap":
    "Sector treemap heatmap — all assets sized by market cap, coloured by % price change. Click a tile to broadcast the symbol.",
};

export const SINGLETON_PANELS: ReadonlySet<PanelId> = new Set([
  "order-ticket",
  "order-blotter",
  "observability",
  "executions",
  "admin",
  "news-sources",
]);

export interface TabChannelConfig {
  panelType: PanelId;
  outgoing?: ChannelNumber;
  incoming?: ChannelNumber;
  pinned?: boolean;
}

export const PANEL_CHANNEL_CAPS: Record<PanelId, { out: boolean; in: boolean }> = {
  "market-ladder": { out: true, in: false },
  "order-ticket": { out: false, in: true },
  "candle-chart": { out: false, in: true },
  "market-depth": { out: false, in: true },
  "order-blotter": { out: true, in: false },
  "algo-monitor": { out: false, in: true },
  observability: { out: false, in: false },
  executions: { out: false, in: true },
  "decision-log": { out: false, in: true },
  "market-match": { out: false, in: true },
  admin: { out: false, in: false },
  news: { out: false, in: false },
  "news-sources": { out: false, in: false },
  "order-progress": { out: false, in: true },
  "market-heatmap": { out: true, in: false },
};

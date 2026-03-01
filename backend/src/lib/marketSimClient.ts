export interface MarketTick {
  prices: Record<string, number>;
  volumes: Record<string, number>;
  marketMinute: number;
}

type TickCallback = (tick: MarketTick) => void;

export class MarketSimClient {
  private ws: WebSocket | null = null;
  private latest: MarketTick = { prices: {}, volumes: {}, marketMinute: 0 };
  private callbacks: TickCallback[] = [];
  private reconnectDelay = 1_000;
  private stopped = false;

  constructor(
    private readonly host: string,
    private readonly port: number,
  ) {}

  start(): void {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.ws?.close();
  }

  onTick(cb: TickCallback): void {
    this.callbacks.push(cb);
  }

  getLatest(): MarketTick {
    return this.latest;
  }

  private connect(): void {
    if (this.stopped) return;
    const url = `ws://${this.host}:${this.port}`;
    console.log(`[MarketSimClient] Connecting to ${url}...`);
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      console.log("[MarketSimClient] Connected to market-sim");
      this.reconnectDelay = 1_000;
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === "marketData" || msg.event === "marketUpdate") {
          this.latest = this.parseTick(msg.data);
          for (const cb of this.callbacks) cb(this.latest);
        }
      } catch {
        // malformed message — ignore
      }
    };

    ws.onerror = () => {
      console.error("[MarketSimClient] WebSocket error");
    };

    ws.onclose = () => {
      console.warn(`[MarketSimClient] Disconnected. Reconnecting in ${this.reconnectDelay}ms...`);
      if (!this.stopped) {
        setTimeout(() => this.connect(), this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
      }
    };
  }

  private parseTick(data: unknown): MarketTick {
    if (
      data !== null &&
      typeof data === "object" &&
      "prices" in (data as object) &&
      "volumes" in (data as object)
    ) {
      const d = data as { prices: Record<string, number>; volumes: Record<string, number>; marketMinute: number };
      return { prices: d.prices, volumes: d.volumes, marketMinute: d.marketMinute ?? 0 };
    }
    return { prices: data as Record<string, number>, volumes: {}, marketMinute: 0 };
  }
}

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMarketFeed } from "../useMarketFeed";

// Minimal WebSocket mock
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 0;
  closed = false;

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  open() {
    this.readyState = 1;
    this.onopen?.();
  }

  send(data: string) {
    this.onmessage?.({ data });
  }

  close() {
    this.closed = true;
    this.onclose?.();
  }
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal("WebSocket", MockWebSocket);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { symbol: "AAPL", initialPrice: 150, volatility: 0.02, sector: "Tech" },
        { symbol: "MSFT", initialPrice: 300, volatility: 0.015, sector: "Tech" },
      ],
    })
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useMarketFeed – initial state", () => {
  it("starts disconnected with empty state", () => {
    const { result } = renderHook(() => useMarketFeed());
    expect(result.current.connected).toBe(false);
    expect(result.current.assets).toEqual([]);
    expect(result.current.prices).toEqual({});
    expect(result.current.priceHistory).toEqual({});
    expect(result.current.candleHistory).toEqual({});
  });
});

describe("useMarketFeed – assets loading", () => {
  it("loads assets from HTTP endpoint on mount", async () => {
    const { result } = renderHook(() => useMarketFeed());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.assets).toHaveLength(2);
    expect(result.current.assets[0].symbol).toBe("AAPL");
    expect(result.current.assets[1].symbol).toBe("MSFT");
  });

  it("initialises empty price and candle history for each asset", async () => {
    const { result } = renderHook(() => useMarketFeed());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.priceHistory.AAPL).toEqual([]);
    expect(result.current.priceHistory.MSFT).toEqual([]);
    expect(result.current.candleHistory.AAPL).toEqual({ "1m": [], "5m": [] });
    expect(result.current.candleHistory.MSFT).toEqual({ "1m": [], "5m": [] });
  });
});

describe("useMarketFeed – WebSocket connection", () => {
  it("sets connected=true when WebSocket opens", () => {
    const { result } = renderHook(() => useMarketFeed());

    act(() => {
      MockWebSocket.instances[0]?.open();
    });

    expect(result.current.connected).toBe(true);
  });

  it("sets connected=false when WebSocket closes", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useMarketFeed());

    act(() => {
      MockWebSocket.instances[0]?.open();
    });
    expect(result.current.connected).toBe(true);

    act(() => {
      MockWebSocket.instances[0]?.close();
    });
    expect(result.current.connected).toBe(false);

    vi.useRealTimers();
  });

  it("closes the WebSocket on unmount", () => {
    const { unmount } = renderHook(() => useMarketFeed());
    const ws = MockWebSocket.instances[0];
    act(() => {
      ws?.open();
    });
    unmount();
    expect(ws?.closed).toBe(true);
  });
});

describe("useMarketFeed – price messages (flat prices format)", () => {
  it("updates prices from a flat price map message", () => {
    const { result } = renderHook(() => useMarketFeed());

    act(() => {
      MockWebSocket.instances[0]?.open();
      MockWebSocket.instances[0]?.send(
        JSON.stringify({ event: "tick", data: { AAPL: 155, MSFT: 305 } })
      );
    });

    expect(result.current.prices.AAPL).toBe(155);
    expect(result.current.prices.MSFT).toBe(305);
  });

  it("appends to price history (up to 60 entries)", () => {
    const { result } = renderHook(() => useMarketFeed());

    act(() => {
      MockWebSocket.instances[0]?.open();
      MockWebSocket.instances[0]?.send(JSON.stringify({ event: "tick", data: { AAPL: 151 } }));
      MockWebSocket.instances[0]?.send(JSON.stringify({ event: "tick", data: { AAPL: 152 } }));
    });

    expect(result.current.priceHistory.AAPL).toEqual([151, 152]);
  });

  it("caps price history at 60 entries", () => {
    const { result } = renderHook(() => useMarketFeed());

    act(() => {
      MockWebSocket.instances[0]?.open();
      for (let i = 0; i < 70; i++) {
        MockWebSocket.instances[0]?.send(
          JSON.stringify({ event: "tick", data: { AAPL: 150 + i } })
        );
      }
    });

    expect(result.current.priceHistory.AAPL).toHaveLength(60);
  });
});

describe("useMarketFeed – price messages (nested prices format)", () => {
  it("extracts prices from nested { prices, volumes } format", () => {
    const { result } = renderHook(() => useMarketFeed());

    act(() => {
      MockWebSocket.instances[0]?.open();
      MockWebSocket.instances[0]?.send(
        JSON.stringify({
          event: "tick",
          data: { prices: { AAPL: 160 }, volumes: { AAPL: 5000 }, marketMinute: 1 },
        })
      );
    });

    expect(result.current.prices.AAPL).toBe(160);
  });
});

describe("useMarketFeed – candle history", () => {
  it("creates a new candle for a new time bucket", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T10:00:00Z"));

    const { result } = renderHook(() => useMarketFeed());

    act(() => {
      MockWebSocket.instances[0]?.open();
      MockWebSocket.instances[0]?.send(JSON.stringify({ event: "tick", data: { AAPL: 150 } }));
    });

    expect(result.current.candleHistory.AAPL["1m"]).toHaveLength(1);
    const candle = result.current.candleHistory.AAPL["1m"][0];
    expect(candle.open).toBe(150);
    expect(candle.high).toBe(150);
    expect(candle.low).toBe(150);
    expect(candle.close).toBe(150);

    vi.useRealTimers();
  });

  it("updates an existing candle's high/low/close within the same bucket", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T10:00:05Z"));

    const { result } = renderHook(() => useMarketFeed());

    act(() => {
      MockWebSocket.instances[0]?.open();
      MockWebSocket.instances[0]?.send(JSON.stringify({ event: "tick", data: { AAPL: 150 } }));
    });

    // Same minute bucket
    act(() => {
      MockWebSocket.instances[0]?.send(JSON.stringify({ event: "tick", data: { AAPL: 155 } }));
    });

    const candle = result.current.candleHistory.AAPL["1m"][0];
    expect(candle.open).toBe(150);
    expect(candle.high).toBe(155);
    expect(candle.close).toBe(155);

    vi.useRealTimers();
  });

  it("discards unparseable WebSocket messages without throwing", () => {
    const { result } = renderHook(() => useMarketFeed());

    expect(() => {
      act(() => {
        MockWebSocket.instances[0]?.open();
        MockWebSocket.instances[0]?.send("not json at all");
      });
    }).not.toThrow();

    expect(result.current.prices).toEqual({});
  });
});

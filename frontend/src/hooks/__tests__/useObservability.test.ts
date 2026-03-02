import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useObservability } from "../useObservability";

class MockEventSource {
  static instances: MockEventSource[] = [];
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(public url: string) {
    MockEventSource.instances.push(this);
  }

  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  close() {
    this.closed = true;
  }
}

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { type: "order_submitted", ts: 1000, payload: {} },
        { type: "child_created", ts: 2000, payload: {} },
      ],
    })
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useObservability – initial state", () => {
  it("starts with an empty events list", () => {
    const { result } = renderHook(() => useObservability());
    expect(result.current.events).toEqual([]);
  });
});

describe("useObservability – historic events fetch", () => {
  it("loads historic events from HTTP endpoint on mount", async () => {
    const { result } = renderHook(() => useObservability());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.events).toHaveLength(2);
    expect(result.current.events[0].type).toBe("order_submitted");
    expect(result.current.events[1].type).toBe("child_created");
  });

  it("handles a failed fetch gracefully (empty events)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const { result } = renderHook(() => useObservability());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.events).toEqual([]);
  });

  it("handles non-ok HTTP response gracefully", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => [] })
    );

    const { result } = renderHook(() => useObservability());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.events).toEqual([]);
  });
});

describe("useObservability – SSE stream", () => {
  it("connects EventSource to the stream endpoint", () => {
    renderHook(() => useObservability());
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toContain("/stream");
  });

  it("prepends new SSE events to the events list", async () => {
    const { result } = renderHook(() => useObservability());

    act(() => {
      MockEventSource.instances[0].emit({ type: "ping", ts: 3000 });
    });

    expect(result.current.events[0]).toMatchObject({ type: "ping", ts: 3000 });
  });

  it("prepends SSE events before previously loaded events", async () => {
    const { result } = renderHook(() => useObservability());

    // Load historic events
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const lengthBefore = result.current.events.length;

    // Receive a live SSE event
    act(() => {
      MockEventSource.instances[0].emit({ type: "live_event", ts: 9999 });
    });

    expect(result.current.events[0].type).toBe("live_event");
    expect(result.current.events).toHaveLength(lengthBefore + 1);
  });

  it("caps events at 1000", () => {
    const { result } = renderHook(() => useObservability());

    act(() => {
      for (let i = 0; i < 1010; i++) {
        MockEventSource.instances[0].emit({ type: "evt", ts: i });
      }
    });

    expect(result.current.events).toHaveLength(1000);
  });

  it("ignores malformed SSE messages without throwing", () => {
    const { result } = renderHook(() => useObservability());

    expect(() => {
      act(() => {
        MockEventSource.instances[0].onmessage?.({ data: "not-valid-json" });
      });
    }).not.toThrow();

    expect(result.current.events).toEqual([]);
  });

  it("closes EventSource on unmount", () => {
    const { unmount } = renderHook(() => useObservability());
    const es = MockEventSource.instances[0];
    unmount();
    expect(es.closed).toBe(true);
  });
});

describe("useObservability – replay()", () => {
  it("returns events in reverse order of the current events list", async () => {
    const { result } = renderHook(() => useObservability());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // The fetch mock returns [{ts:1000}, {ts:2000}]; events is stored in that order.
    // replay() reverses the list, so replayed[0] has the higher ts.
    const replayed = result.current.replay();
    expect(replayed).toHaveLength(2);
    // replayed order is the reverse of events
    expect(replayed[0].ts).toBeGreaterThanOrEqual(replayed[1].ts ?? 0);
  });
});

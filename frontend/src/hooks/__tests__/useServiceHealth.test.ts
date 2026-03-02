import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useServiceHealth } from "../useServiceHealth";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function mockFetchOk(overrides: Record<string, unknown> = {}) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      service: "test",
      status: "ok",
      version: "1.0.0",
      ...overrides,
    }),
  });
}

function mockFetchError() {
  return vi.fn().mockRejectedValue(new Error("Network error"));
}

describe("useServiceHealth – initial state", () => {
  it("initialises all services as unknown with no lastChecked", () => {
    vi.stubGlobal("fetch", mockFetchOk());
    const { result } = renderHook(() => useServiceHealth());

    expect(result.current).toHaveLength(7);
    for (const svc of result.current) {
      expect(svc.state).toBe("unknown");
      expect(svc.lastChecked).toBeNull();
      expect(svc.version).toBe("—");
    }
  });

  it("returns services with expected names", () => {
    vi.stubGlobal("fetch", mockFetchOk());
    const { result } = renderHook(() => useServiceHealth());

    const names = result.current.map((s) => s.name);
    expect(names).toContain("Market Sim");
    expect(names).toContain("EMS");
    expect(names).toContain("OMS");
    expect(names).toContain("TWAP Algo");
    expect(names).toContain("POV Algo");
    expect(names).toContain("VWAP Algo");
  });
});

describe("useServiceHealth – polling", () => {
  it("updates services to ok state after successful poll", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", mockFetchOk());

    const { result } = renderHook(() => useServiceHealth());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    for (const svc of result.current) {
      expect(svc.state).toBe("ok");
      expect(svc.version).toBe("1.0.0");
      expect(svc.lastChecked).not.toBeNull();
    }
  });

  it("marks services as error when fetch fails", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", mockFetchError());

    const { result } = renderHook(() => useServiceHealth());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    for (const svc of result.current) {
      expect(svc.state).toBe("error");
      expect(svc.version).toBe("—");
    }
  });

  it("marks service as error when response is not ok", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) })
    );

    const { result } = renderHook(() => useServiceHealth());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    for (const svc of result.current) {
      expect(svc.state).toBe("error");
    }
  });

  it("stores extra response fields in meta", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", mockFetchOk({ pendingOrders: 5, region: "us-east" }));

    const { result } = renderHook(() => useServiceHealth());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const first = result.current[0];
    expect(first.meta).toMatchObject({ pendingOrders: 5, region: "us-east" });
    // known fields should be stripped from meta
    expect(first.meta).not.toHaveProperty("service");
    expect(first.meta).not.toHaveProperty("status");
    expect(first.meta).not.toHaveProperty("version");
  });

  it("clears interval and cancels poll on unmount", async () => {
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    vi.stubGlobal("fetch", mockFetchOk());

    const { unmount } = renderHook(() => useServiceHealth());

    await act(async () => {
      await Promise.resolve();
    });

    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it("polls again after POLL_INTERVAL_MS", async () => {
    vi.useFakeTimers();
    const fetchMock = mockFetchOk();
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useServiceHealth());

    // Initial poll
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const callsAfterInit = fetchMock.mock.calls.length;

    // Advance past poll interval
    await act(async () => {
      vi.advanceTimersByTime(10_001);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterInit);
  });
});

describe("useServiceHealth – version change detection", () => {
  it("calls window.location.reload when a service version changes", async () => {
    vi.useFakeTimers();

    let callCount = 0;
    const reloadMock = vi.fn();
    vi.stubGlobal("location", { reload: reloadMock });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        callCount++;
        const version = callCount <= 7 ? "1.0.0" : "2.0.0";
        return Promise.resolve({
          ok: true,
          json: async () => ({ version, service: "x", status: "ok" }),
        });
      })
    );

    renderHook(() => useServiceHealth());

    // First poll — establishes baseline
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Second poll — version changes
    await act(async () => {
      vi.advanceTimersByTime(10_001);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(reloadMock).toHaveBeenCalled();
  });
});

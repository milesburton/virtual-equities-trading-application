import { configureStore } from "@reduxjs/toolkit";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardContextValue } from "../../components/DashboardLayout";
import { DashboardContext, DEFAULT_LAYOUT, STORAGE_KEY } from "../../components/DashboardLayout";
import { ChannelContext } from "../../contexts/ChannelContext";
import { windowSlice } from "../../store/windowSlice";
import { usePopOut } from "../usePopOut";

function makeStore() {
  return configureStore({
    reducer: { windows: windowSlice.reducer },
  });
}

const dashCtx: DashboardContextValue = {
  layout: DEFAULT_LAYOUT,
  setLayout: () => {},
  activePanelIds: new Set(),
  addPanel: () => {},
  removePanel: () => {},
  resetLayout: () => {},
  storageKey: STORAGE_KEY,
};

function wrapper(store: ReturnType<typeof makeStore>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <DashboardContext.Provider value={dashCtx}>
          <ChannelContext.Provider
            value={{
              instanceId: "unknown",
              panelType: "market-ladder",
              outgoing: null,
              incoming: null,
            }}
          >
            {children}
          </ChannelContext.Provider>
        </DashboardContext.Provider>
      </Provider>
    );
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("usePopOut – initial state", () => {
  it("isPopOut is false initially", () => {
    const store = makeStore();
    const { result } = renderHook(() => usePopOut("order-blotter"), {
      wrapper: wrapper(store),
    });
    expect(result.current.isPopOut).toBe(false);
  });
});

describe("usePopOut – popOut()", () => {
  it("calls window.open with the correct panel param", () => {
    const mockWindow = { closed: false } as Window;
    const openSpy = vi.spyOn(window, "open").mockReturnValue(mockWindow);

    const store = makeStore();
    const { result } = renderHook(() => usePopOut("algo-monitor"), {
      wrapper: wrapper(store),
    });

    result.current.popOut();

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining("panel=algo-monitor"),
      "panel-algo-monitor",
      expect.stringContaining("width=")
    );
  });

  it("dispatches panelPopped when window.open succeeds", () => {
    const mockWindow = { closed: false } as Window;
    vi.spyOn(window, "open").mockReturnValue(mockWindow);

    const store = makeStore();
    const { result } = renderHook(() => usePopOut("market-ladder"), {
      wrapper: wrapper(store),
    });

    result.current.popOut();

    expect(store.getState().windows.popOuts["market-ladder"].open).toBe(true);
  });

  it("does not dispatch panelPopped when window.open returns null", () => {
    vi.spyOn(window, "open").mockReturnValue(null);

    const store = makeStore();
    const { result } = renderHook(() => usePopOut("order-blotter"), {
      wrapper: wrapper(store),
    });

    result.current.popOut();

    expect(store.getState().windows.popOuts["order-blotter"]?.open ?? false).toBe(false);
  });
});

describe("usePopOut – close polling", () => {
  it("dispatches panelClosed when the pop-out window closes", () => {
    const mockWindow = { closed: false } as { closed: boolean };
    vi.spyOn(window, "open").mockReturnValue(mockWindow as Window);

    const store = makeStore();
    const { result } = renderHook(() => usePopOut("observability"), {
      wrapper: wrapper(store),
    });

    result.current.popOut();
    expect(store.getState().windows.popOuts.observability.open).toBe(true);

    // Simulate the pop-out window closing
    mockWindow.closed = true;

    // Advance past one poll interval (500ms)
    vi.advanceTimersByTime(500);

    expect(store.getState().windows.popOuts.observability.open).toBe(false);
  });

  it("continues polling until the window closes", () => {
    const mockWindow = { closed: false } as { closed: boolean };
    vi.spyOn(window, "open").mockReturnValue(mockWindow as Window);

    const store = makeStore();
    const { result } = renderHook(() => usePopOut("order-blotter"), {
      wrapper: wrapper(store),
    });

    result.current.popOut();

    // Still open after 2 intervals
    vi.advanceTimersByTime(1000);
    expect(store.getState().windows.popOuts["order-blotter"].open).toBe(true);

    // Now close
    mockWindow.closed = true;
    vi.advanceTimersByTime(500);
    expect(store.getState().windows.popOuts["order-blotter"].open).toBe(false);
  });
});

describe("usePopOut – closePopOut()", () => {
  it("dispatches panelClosed directly", () => {
    const store = makeStore();
    // Manually pre-set the panel as open
    store.dispatch(windowSlice.actions.panelPopped({ panelId: "algo-monitor" }));

    const { result } = renderHook(() => usePopOut("algo-monitor"), {
      wrapper: wrapper(store),
    });

    expect(result.current.isPopOut).toBe(true);
    result.current.closePopOut();
    expect(store.getState().windows.popOuts["algo-monitor"].open).toBe(false);
  });
});

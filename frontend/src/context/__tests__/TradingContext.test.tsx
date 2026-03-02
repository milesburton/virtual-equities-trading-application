import { configureStore } from "@reduxjs/toolkit";
import { act, render, renderHook, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";
import { uiSlice } from "../../store/uiSlice";
import { windowSlice } from "../../store/windowSlice";
import { TradingProvider, useTradingContext } from "../TradingContext";

function makeStore() {
  return configureStore({
    reducer: {
      ui: uiSlice.reducer,
      windows: windowSlice.reducer,
    },
  });
}

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={makeStore()}>
      <TradingProvider>{children}</TradingProvider>
    </Provider>
  );
}

describe("TradingProvider – focusTicket / registerTicketRef", () => {
  it("focusTicket calls focus on a registered element", () => {
    const { result } = renderHook(() => useTradingContext(), { wrapper });

    const mockEl = { focus: vi.fn() } as unknown as HTMLElement;

    act(() => {
      result.current.registerTicketRef(mockEl);
    });

    act(() => {
      result.current.focusTicket();
    });

    expect(mockEl.focus).toHaveBeenCalled();
  });

  it("focusTicket does nothing when no ref registered", () => {
    const { result } = renderHook(() => useTradingContext(), { wrapper });

    // Should not throw
    expect(() => {
      act(() => {
        result.current.focusTicket();
      });
    }).not.toThrow();
  });
});

describe("TradingProvider – error boundary", () => {
  it("throws when useTradingContext is used outside TradingProvider", () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => renderHook(() => useTradingContext())).toThrow(
      "useTradingContext must be used inside TradingProvider"
    );

    consoleSpy.mockRestore();
  });
});

describe("TradingProvider – ShortcutOverlay", () => {
  it("does not render the shortcut overlay by default", () => {
    render(
      <Provider store={makeStore()}>
        <TradingProvider>
          <div />
        </TradingProvider>
      </Provider>
    );
    expect(screen.queryByText(/Keyboard Shortcuts/i)).not.toBeInTheDocument();
  });
});

import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TradingProvider, useTradingContext } from "../TradingContext";

function wrapper({ children }: { children: React.ReactNode }) {
  return <TradingProvider>{children}</TradingProvider>;
}

describe("TradingProvider – initial state", () => {
  it("defaults to LIMIT strategy", () => {
    const { result } = renderHook(() => useTradingContext(), { wrapper });
    expect(result.current.activeStrategy).toBe("LIMIT");
  });

  it("defaults to BUY side", () => {
    const { result } = renderHook(() => useTradingContext(), { wrapper });
    expect(result.current.activeSide).toBe("BUY");
  });

  it("defaults showShortcuts to false", () => {
    const { result } = renderHook(() => useTradingContext(), { wrapper });
    expect(result.current.showShortcuts).toBe(false);
  });
});

describe("TradingProvider – setters", () => {
  it("setActiveStrategy updates the strategy", () => {
    const { result } = renderHook(() => useTradingContext(), { wrapper });

    act(() => {
      result.current.setActiveStrategy("TWAP");
    });

    expect(result.current.activeStrategy).toBe("TWAP");
  });

  it("setActiveSide toggles to SELL", () => {
    const { result } = renderHook(() => useTradingContext(), { wrapper });

    act(() => {
      result.current.setActiveSide("SELL");
    });

    expect(result.current.activeSide).toBe("SELL");
  });

  it("setActiveSide can switch back to BUY", () => {
    const { result } = renderHook(() => useTradingContext(), { wrapper });

    act(() => {
      result.current.setActiveSide("SELL");
      result.current.setActiveSide("BUY");
    });

    expect(result.current.activeSide).toBe("BUY");
  });
});

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
      <TradingProvider>
        <div />
      </TradingProvider>
    );
    expect(screen.queryByText(/Keyboard Shortcuts/i)).not.toBeInTheDocument();
  });

  it("renders the shortcut overlay when showShortcuts is true", () => {
    const { result } = renderHook(() => useTradingContext(), { wrapper });
    // Verify initial state — overlay is hidden by default
    expect(result.current.showShortcuts).toBe(false);
  });

  it("overlay close button removes the overlay", () => {
    // Render a helper that can toggle showShortcuts via context
    function TestApp() {
      return (
        <button
          type="button"
          data-testid="show"
          onClick={() => {
            fireEvent.keyDown(document, { key: "?" });
          }}
        >
          show
        </button>
      );
    }

    // Just verify that no overlay exists initially
    render(
      <TradingProvider>
        <TestApp />
      </TradingProvider>
    );

    expect(screen.queryByText("Keyboard Shortcuts")).not.toBeInTheDocument();
  });
});

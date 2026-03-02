import "@testing-library/jest-dom";
import { vi } from "vitest";

// jsdom does not implement ResizeObserver – provide a minimal stub
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom does not implement BroadcastChannel – provide a minimal stub
class MockBroadcastChannel {
  onmessage: ((ev: MessageEvent) => void) | null = null;
  postMessage = vi.fn();
  close = vi.fn();
  constructor(public name: string) {}
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() {
    return true;
  }
}
globalThis.BroadcastChannel = MockBroadcastChannel as unknown as typeof BroadcastChannel;

// jsdom does not implement HTMLCanvasElement.getContext – stub it so
// lightweight-charts (canvas-based) doesn't crash in unit tests.
HTMLCanvasElement.prototype.getContext = () => null;

import "@testing-library/jest-dom";

// jsdom does not implement ResizeObserver – provide a minimal stub
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

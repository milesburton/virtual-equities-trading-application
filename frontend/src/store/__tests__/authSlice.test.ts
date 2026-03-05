import { describe, expect, it } from "vitest";
import type { AuthUser, TradingLimits } from "../authSlice";
import {
  authSlice,
  clearUser,
  setLimits,
  setStatus,
  setUser,
  setUserWithLimits,
} from "../authSlice";

const { reducer } = authSlice;

const DEFAULT_LIMITS: TradingLimits = {
  max_order_qty: 10_000,
  max_daily_notional: 1_000_000,
  allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP"],
};

const TRADER: AuthUser = {
  id: "user-1",
  name: "Alice",
  role: "trader",
  avatar_emoji: "AL",
};

const ADMIN: AuthUser = {
  id: "admin-1",
  name: "Admin",
  role: "admin",
  avatar_emoji: "AD",
};

const CUSTOM_LIMITS: TradingLimits = {
  max_order_qty: 500,
  max_daily_notional: 50_000,
  allowed_strategies: ["LIMIT"],
};

describe("authSlice", () => {
  it("has correct initial state", () => {
    const state = reducer(undefined, { type: "@@INIT" });
    expect(state.user).toBeNull();
    expect(state.status).toBe("loading");
    expect(state.limits).toEqual(DEFAULT_LIMITS);
  });

  describe("setUser", () => {
    it("sets user and transitions status to authenticated", () => {
      const state = reducer(undefined, setUser(TRADER));
      expect(state.user).toEqual(TRADER);
      expect(state.status).toBe("authenticated");
    });

    it("works for admin role", () => {
      const state = reducer(undefined, setUser(ADMIN));
      expect(state.user?.role).toBe("admin");
      expect(state.status).toBe("authenticated");
    });

    it("does not change limits", () => {
      const state = reducer(undefined, setUser(TRADER));
      expect(state.limits).toEqual(DEFAULT_LIMITS);
    });
  });

  describe("setUserWithLimits", () => {
    it("sets user and custom limits together", () => {
      const state = reducer(undefined, setUserWithLimits({ user: TRADER, limits: CUSTOM_LIMITS }));
      expect(state.user).toEqual(TRADER);
      expect(state.limits).toEqual(CUSTOM_LIMITS);
      expect(state.status).toBe("authenticated");
    });
  });

  describe("setLimits", () => {
    it("updates limits without touching user or status", () => {
      let state = reducer(undefined, setUser(TRADER));
      state = reducer(state, setLimits(CUSTOM_LIMITS));
      expect(state.limits).toEqual(CUSTOM_LIMITS);
      expect(state.user).toEqual(TRADER);
      expect(state.status).toBe("authenticated");
    });
  });

  describe("clearUser", () => {
    it("clears user, resets limits to defaults, sets unauthenticated", () => {
      let state = reducer(undefined, setUserWithLimits({ user: TRADER, limits: CUSTOM_LIMITS }));
      state = reducer(state, clearUser());
      expect(state.user).toBeNull();
      expect(state.status).toBe("unauthenticated");
      expect(state.limits).toEqual(DEFAULT_LIMITS);
    });
  });

  describe("setStatus", () => {
    it("transitions to loading", () => {
      const state = reducer(undefined, setStatus("loading"));
      expect(state.status).toBe("loading");
    });

    it("transitions to unauthenticated", () => {
      const state = reducer(undefined, setStatus("unauthenticated"));
      expect(state.status).toBe("unauthenticated");
    });
  });
});

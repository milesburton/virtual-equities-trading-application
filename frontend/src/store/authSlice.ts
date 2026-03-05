import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";

export interface AuthUser {
  id: string;
  name: string;
  role: "trader" | "admin";
  avatar_emoji: string;
}

export interface TradingLimits {
  max_order_qty: number;
  max_daily_notional: number;
  allowed_strategies: string[];
}

const DEFAULT_LIMITS: TradingLimits = {
  max_order_qty: 10_000,
  max_daily_notional: 1_000_000,
  allowed_strategies: ["LIMIT", "TWAP", "POV", "VWAP"],
};

interface AuthState {
  user: AuthUser | null;
  limits: TradingLimits;
  status: "loading" | "authenticated" | "unauthenticated";
}

const initialState: AuthState = {
  user: null,
  limits: DEFAULT_LIMITS,
  status: "loading",
};

export const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<AuthUser>) {
      state.user = action.payload;
      state.status = "authenticated";
    },
    setUserWithLimits(state, action: PayloadAction<{ user: AuthUser; limits: TradingLimits }>) {
      state.user = action.payload.user;
      state.limits = action.payload.limits;
      state.status = "authenticated";
    },
    setLimits(state, action: PayloadAction<TradingLimits>) {
      state.limits = action.payload;
    },
    clearUser(state) {
      state.user = null;
      state.limits = DEFAULT_LIMITS;
      state.status = "unauthenticated";
    },
    setStatus(state, action: PayloadAction<AuthState["status"]>) {
      state.status = action.payload;
    },
  },
});

export const { setUser, setUserWithLimits, setLimits, clearUser, setStatus } = authSlice.actions;

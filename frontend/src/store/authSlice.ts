import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";

export interface AuthUser {
  id: string;
  name: string;
  role: "trader" | "admin";
  avatar_emoji: string;
}

interface AuthState {
  user: AuthUser | null;
  status: "loading" | "authenticated" | "unauthenticated";
}

const initialState: AuthState = {
  user: null,
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
    clearUser(state) {
      state.user = null;
      state.status = "unauthenticated";
    },
    setStatus(state, action: PayloadAction<AuthState["status"]>) {
      state.status = action.payload;
    },
  },
});

export const { setUser, clearUser, setStatus } = authSlice.actions;

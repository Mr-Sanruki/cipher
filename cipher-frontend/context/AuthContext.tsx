import React, { createContext, useCallback, useEffect, useMemo, useReducer } from "react";
import { router } from "expo-router";
import api, { setUnauthorizedHandler } from "../services/api";
import { clearSession, getToken, getUser, setSession } from "../services/auth";
import type { AuthSession, User, UserStatus } from "../types";

type AuthContextValue = {
  status: "loading" | "authenticated" | "unauthenticated";
  token: string | null;
  user: User | null;
  isBusy: boolean;
  error: string | null;
  signup: (input: { email: string; password: string; name: string }) => Promise<{ email: string; devOtp?: string; expiresIn?: number }>;
  requestOtp: (input: { email: string }) => Promise<{ expiresIn: number; devOtp?: string }>;
  verifyOtp: (input: { email: string; otp: string }) => Promise<void>;
  login: (input: { email: string; password: string }) => Promise<void>;
  updateProfile: (input: {
    name?: string;
    avatarUrl?: string;
    status?: UserStatus;
    customStatus?: string;
    phone?: string;
    bio?: string;
    timezone?: string;
    location?: string;
  }) => Promise<User>;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
};

type State = {
  status: AuthContextValue["status"];
  token: string | null;
  user: User | null;
  isBusy: boolean;
  error: string | null;
};

type Action =
  | { type: "HYDRATE_START" }
  | { type: "HYDRATE_SUCCESS"; payload: { token: string; user: User } }
  | { type: "HYDRATE_EMPTY" }
  | { type: "SET_BUSY"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_SESSION"; payload: { token: string; user: User } }
  | { type: "CLEAR_SESSION" };

const initialState: State = {
  status: "loading",
  token: null,
  user: null,
  isBusy: false,
  error: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "HYDRATE_START":
      return { ...state, status: "loading" };
    case "HYDRATE_SUCCESS":
      return {
        ...state,
        status: "authenticated",
        token: action.payload.token,
        user: action.payload.user,
      };
    case "HYDRATE_EMPTY":
      return { ...state, status: "unauthenticated", token: null, user: null };
    case "SET_BUSY":
      return { ...state, isBusy: action.payload };
    case "SET_ERROR":
      return { ...state, error: action.payload };
    case "SET_SESSION":
      return {
        ...state,
        status: "authenticated",
        token: action.payload.token,
        user: action.payload.user,
      };
    case "CLEAR_SESSION":
      return { ...state, status: "unauthenticated", token: null, user: null };
    default:
      return state;
  }
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      dispatch({ type: "CLEAR_SESSION" });
      router.replace("/(auth)/login");
    });

    return () => {
      setUnauthorizedHandler(null);
    };
  }, []);

  const updateProfile = useCallback<AuthContextValue["updateProfile"]>(
    async (input) => {
      if (!state.token) {
        throw new Error("Not authenticated");
      }

      dispatch({ type: "SET_BUSY", payload: true });
      dispatch({ type: "SET_ERROR", payload: null });

      try {
        const response = await api.put("/api/users/profile", input);
        const user = (response.data as any)?.user as User | undefined;

        if (!user?._id) {
          throw new Error("Invalid update profile response");
        }

        const session: AuthSession = { token: state.token, user };
        await setSession(session);

        dispatch({ type: "SET_SESSION", payload: { token: state.token, user } });
        return user;
      } catch (e: any) {
        dispatch({ type: "SET_ERROR", payload: e?.message ?? "Failed to update profile" });
        throw e;
      } finally {
        dispatch({ type: "SET_BUSY", payload: false });
      }
    },
    [state.token]
  );

  const hydrate = useCallback(async () => {
    dispatch({ type: "HYDRATE_START" });

    const [token, user] = await Promise.all([getToken(), getUser()]);

    if (token && user) {
      dispatch({ type: "HYDRATE_SUCCESS", payload: { token, user } });
      return;
    }

    dispatch({ type: "HYDRATE_EMPTY" });
  }, []);

  useEffect(() => {
    hydrate().catch(() => {
      dispatch({ type: "HYDRATE_EMPTY" });
    });
  }, [hydrate]);

  const clearError = useCallback(() => {
    dispatch({ type: "SET_ERROR", payload: null });
  }, []);

  const signup = useCallback<AuthContextValue["signup"]>(async (input) => {
    dispatch({ type: "SET_BUSY", payload: true });
    dispatch({ type: "SET_ERROR", payload: null });

    try {
      const response = await api.post("/api/auth/signup", input);
      const email = String((response.data as any)?.email ?? input.email);
      const devOtp = typeof (response.data as any)?.devOtp === "string" ? String((response.data as any).devOtp) : undefined;
      const expiresIn = typeof (response.data as any)?.expiresIn === "number" ? Number((response.data as any).expiresIn) : undefined;
      return { email, devOtp, expiresIn };
    } catch (e: any) {
      dispatch({ type: "SET_ERROR", payload: e?.message ?? "Signup failed" });
      throw e;
    } finally {
      dispatch({ type: "SET_BUSY", payload: false });
    }
  }, []);

  const requestOtp = useCallback<AuthContextValue["requestOtp"]>(async (input) => {
    dispatch({ type: "SET_BUSY", payload: true });
    dispatch({ type: "SET_ERROR", payload: null });

    try {
      const response = await api.post("/api/auth/request-otp", input);
      const expiresIn = Number((response.data as any)?.expiresIn ?? 600);
      const devOtp = typeof (response.data as any)?.devOtp === "string" ? String((response.data as any).devOtp) : undefined;
      return { expiresIn, devOtp };
    } catch (e: any) {
      dispatch({ type: "SET_ERROR", payload: e?.message ?? "Failed to send OTP" });
      throw e;
    } finally {
      dispatch({ type: "SET_BUSY", payload: false });
    }
  }, []);

  const verifyOtp = useCallback<AuthContextValue["verifyOtp"]>(async (input) => {
    dispatch({ type: "SET_BUSY", payload: true });
    dispatch({ type: "SET_ERROR", payload: null });

    try {
      const response = await api.post("/api/auth/verify-otp", input);
      const token = String((response.data as any)?.token ?? "");
      const user = (response.data as any)?.user as User | undefined;

      if (!token || !user?._id) {
        throw new Error("Invalid verify response");
      }

      const session: AuthSession = { token, user };
      await setSession(session);

      dispatch({ type: "SET_SESSION", payload: { token, user } });
    } catch (e: any) {
      dispatch({ type: "SET_ERROR", payload: e?.message ?? "OTP verification failed" });
      throw e;
    } finally {
      dispatch({ type: "SET_BUSY", payload: false });
    }
  }, []);

  const login = useCallback<AuthContextValue["login"]>(async (input) => {
    dispatch({ type: "SET_BUSY", payload: true });
    dispatch({ type: "SET_ERROR", payload: null });

    try {
      const response = await api.post("/api/auth/login", input);
      const token = String((response.data as any)?.token ?? "");
      const user = (response.data as any)?.user as User | undefined;

      if (!token || !user?._id) {
        throw new Error("Invalid login response");
      }

      const session: AuthSession = { token, user };
      await setSession(session);

      dispatch({ type: "SET_SESSION", payload: { token, user } });
    } catch (e: any) {
      dispatch({ type: "SET_ERROR", payload: e?.message ?? "Login failed" });
      throw e;
    } finally {
      dispatch({ type: "SET_BUSY", payload: false });
    }
  }, []);

  const refresh = useCallback<AuthContextValue["refresh"]>(async () => {
    if (!state.token) return;

    dispatch({ type: "SET_BUSY", payload: true });
    dispatch({ type: "SET_ERROR", payload: null });

    try {
      const response = await api.post("/api/auth/refresh");
      const nextToken = String((response.data as any)?.token ?? "");

      if (!nextToken) throw new Error("Invalid refresh response");
      if (!state.user) throw new Error("No user in session");

      const session: AuthSession = { token: nextToken, user: state.user };
      await setSession(session);

      dispatch({ type: "SET_SESSION", payload: { token: nextToken, user: state.user } });
    } catch (e: any) {
      dispatch({ type: "SET_ERROR", payload: e?.message ?? "Session refresh failed" });
      throw e;
    } finally {
      dispatch({ type: "SET_BUSY", payload: false });
    }
  }, [state.token, state.user]);

  const logout = useCallback<AuthContextValue["logout"]>(async () => {
    dispatch({ type: "SET_BUSY", payload: true });
    dispatch({ type: "SET_ERROR", payload: null });

    try {
      await api.post("/api/auth/logout");
    } catch {
      // ignore
    } finally {
      await clearSession();
      dispatch({ type: "CLEAR_SESSION" });
      dispatch({ type: "SET_BUSY", payload: false });
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      token: state.token,
      user: state.user,
      isBusy: state.isBusy,
      error: state.error,
      signup,
      requestOtp,
      verifyOtp,
      login,
      updateProfile,
      refresh,
      logout,
      clearError,
    }),
    [
      clearError,
      login,
      logout,
      refresh,
      requestOtp,
      signup,
      state.error,
      state.isBusy,
      state.status,
      state.token,
      state.user,
      updateProfile,
      verifyOtp,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

import { useContext } from "react";
import { AuthContext } from "../context/AuthContext";

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    const error = new Error("useAuth must be used within AuthProvider");
    console.error(error);
    const fail = async () => {
      throw error;
    };
    return {
      status: "loading",
      token: null,
      user: null,
      isBusy: false,
      error: error.message,
      signup: fail,
      requestOtp: fail,
      verifyOtp: fail,
      login: fail,
      updateProfile: fail,
      refresh: fail,
      logout: fail,
      clearError: () => {},
    } as any;
  }
  return ctx;
}

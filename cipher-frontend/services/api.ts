import axios, { AxiosError, AxiosHeaders } from "axios";
import type { ApiError } from "../types";
import { clearSession, getToken } from "./auth";
import { Platform } from "react-native";

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

function resolveApiBaseUrl(): string | null {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  const legacy = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const raw = apiUrl || legacy;
  if (!raw) return null;
  const normalized = raw.replace(/\/+$/, "");

  if (Platform.OS === "web") {
    return normalized.replace(/^(https?:\/\/)\d{1,3}(?:\.\d{1,3}){3}:(\d+)$/i, "$1localhost:$2");
  }

  return normalized;
}

const api = axios.create({
  baseURL: "",
  timeout: 15000,
  headers: {
    Accept: "application/json",
  },
});

api.interceptors.request.use(async (config) => {
  const baseURL = resolveApiBaseUrl();
  if (!baseURL) {
    throw new Error("Missing EXPO_PUBLIC_API_URL (or EXPO_PUBLIC_API_BASE_URL). Set it and restart Expo.");
  }

  config.baseURL = baseURL;

  const token = await getToken();
  if (token) {
    const headers = AxiosHeaders.from(config.headers);
    headers.set("Authorization", `Bearer ${token}`);
    config.headers = headers;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;

    if (status === 401) {
      await clearSession();
      unauthorizedHandler?.();
    }

    if (axios.isAxiosError(error)) {
      return Promise.reject(normalizeApiError(error));
    }

    const message = error instanceof Error ? error.message : String(error);
    return Promise.reject<ApiError>({ message });
  }
);

function normalizeApiError(error: AxiosError): ApiError {
  const status = error.response?.status;

  const data = error.response?.data as any;
  const messageFromServer = typeof data?.message === "string" ? data.message : undefined;

  return {
    status,
    message: messageFromServer ?? error.message ?? "Request failed",
    details: data?.details,
  };
}

export default api;

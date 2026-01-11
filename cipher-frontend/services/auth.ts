import { getItem, getJson, removeItem, setItem, setJson } from "./storage";
import type { AuthSession, User } from "../types";

const TOKEN_KEY = "cipher.auth.token";
const USER_KEY = "cipher.auth.user";

export async function getToken(): Promise<string | null> {
  return getItem(TOKEN_KEY);
}

export async function getUser(): Promise<User | null> {
  return getJson<User>(USER_KEY);
}

export async function setSession(session: AuthSession): Promise<void> {
  await Promise.all([setItem(TOKEN_KEY, session.token), setJson(USER_KEY, session.user)]);
}

export async function clearSession(): Promise<void> {
  await Promise.all([removeItem(TOKEN_KEY), removeItem(USER_KEY)]);
}

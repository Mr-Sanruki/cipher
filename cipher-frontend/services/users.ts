import api from "./api";

export type SessionDto = {
  _id: string;
  userAgent: string;
  ip: string;
  lastUsedAt: string | null;
  createdAt: string | null;
  revokedAt: string | null;
  isCurrent: boolean;
};

export async function changePassword(input: { oldPassword: string; newPassword: string }): Promise<void> {
  await api.post("/api/users/change-password", input);
}

export async function deleteAccount(input: { password: string }): Promise<void> {
  await api.post("/api/users/delete-account", input);
}

export async function requestEmailChange(input: { newEmail: string; password: string }): Promise<{ expiresIn?: number; devOtp?: string } | null> {
  const res = await api.post("/api/users/request-email-change", input);
  const data = (res.data as any) ?? null;
  if (!data) return null;
  return {
    expiresIn: typeof data.expiresIn === "number" ? data.expiresIn : undefined,
    devOtp: typeof data.devOtp === "string" ? data.devOtp : undefined,
  };
}

export async function verifyEmailChange(input: { newEmail: string; otp: string }): Promise<void> {
  await api.post("/api/users/verify-email-change", input);
}

export async function listSessions(): Promise<SessionDto[]> {
  const res = await api.get("/api/users/sessions");
  const sessions = (res.data as any)?.sessions;
  return Array.isArray(sessions) ? (sessions as SessionDto[]) : [];
}

export async function revokeSession(input: { sessionId: string }): Promise<void> {
  await api.post("/api/users/sessions/revoke", input);
}

export async function revokeOtherSessions(): Promise<void> {
  await api.post("/api/users/sessions/revoke-others");
}

export async function setupTwoFa(): Promise<{ secret: string; otpauthUrl: string; backupCodes: string[]; devNowCode?: string }>{
  const res = await api.post("/api/users/2fa/setup");
  const data = (res.data as any) ?? {};
  return {
    secret: String(data.secret ?? ""),
    otpauthUrl: String(data.otpauthUrl ?? ""),
    backupCodes: Array.isArray(data.backupCodes) ? (data.backupCodes as string[]).map(String) : [],
    devNowCode: typeof data.devNowCode === "string" ? data.devNowCode : undefined,
  };
}

export async function verifyTwoFa(input: { code: string }): Promise<void> {
  await api.post("/api/users/2fa/verify", input);
}

export async function disableTwoFa(input: { code: string }): Promise<void> {
  await api.post("/api/users/2fa/disable", input);
}

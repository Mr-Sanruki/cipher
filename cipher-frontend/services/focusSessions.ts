import api from "./api";

export type FocusSessionDto = {
  _id: string;
  workspaceId: string;
  userId: string;
  taskId?: string | null;
  startedAt: string;
  endedAt?: string | null;
  mode?: "focus" | "break";
  durationSeconds?: number;
  createdAt?: string;
  updatedAt?: string;
};

export async function listFocusSessions(workspaceId: string): Promise<FocusSessionDto[]> {
  const res = await api.get("/api/focus_sessions", { params: { workspaceId } });
  const focusSessions = (res.data as any)?.focusSessions;
  return Array.isArray(focusSessions) ? (focusSessions as FocusSessionDto[]) : [];
}

export async function createFocusSession(input: {
  workspaceId: string;
  startedAt?: string;
  endedAt?: string | null;
  mode?: "focus" | "break";
  durationSeconds?: number;
  taskId?: string | null;
}): Promise<FocusSessionDto> {
  const res = await api.post("/api/focus_sessions", input);
  const focusSession = (res.data as any)?.focusSession as FocusSessionDto | undefined;
  if (!focusSession?._id) throw new Error("Invalid create focus session response");
  return focusSession;
}

export async function updateFocusSession(
  sessionId: string,
  input: { endedAt?: string | null; durationSeconds?: number; mode?: "focus" | "break"; taskId?: string | null },
): Promise<FocusSessionDto> {
  const res = await api.put(`/api/focus_sessions/${sessionId}`, input);
  const focusSession = (res.data as any)?.focusSession as FocusSessionDto | undefined;
  if (!focusSession?._id) throw new Error("Invalid update focus session response");
  return focusSession;
}

export async function deleteFocusSession(sessionId: string): Promise<void> {
  await api.delete(`/api/focus_sessions/${sessionId}`);
}

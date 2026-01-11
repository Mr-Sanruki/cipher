import api from "./api";
import type { WorkspaceDto } from "../types";

export async function listWorkspaces(): Promise<WorkspaceDto[]> {
  const res = await api.get("/api/workspaces");

  const data = res.data as any;

  if (Array.isArray(data)) return data as WorkspaceDto[];
  if (Array.isArray(data?.workspaces)) return data.workspaces as WorkspaceDto[];
  if (Array.isArray(data?.data)) return data.data as WorkspaceDto[];

  throw new Error("Invalid workspaces response. Check API base URL and authentication.");
}

export async function createWorkspace(input: { name: string; description?: string }): Promise<{ workspace: WorkspaceDto; verificationCode: string }> {
  const res = await api.post("/api/workspaces", input);

  const workspace = (res.data as any)?.workspace as WorkspaceDto | undefined;
  const verificationCode = String((res.data as any)?.verificationCode ?? "");

  if (!workspace?._id || !verificationCode) {
    throw new Error("Invalid create workspace response");
  }

  return { workspace, verificationCode };
}

export async function joinWorkspace(verificationCode: string): Promise<WorkspaceDto> {
  const res = await api.post("/api/workspaces/join", { verificationCode });
  const workspace = (res.data as any)?.workspace as WorkspaceDto | undefined;

  if (!workspace?._id) {
    throw new Error("Invalid join workspace response");
  }

  return workspace;
}

export async function updateWorkspace(workspaceId: string, input: { name?: string; description?: string }): Promise<WorkspaceDto> {
  const res = await api.put(`/api/workspaces/${workspaceId}`, input);
  const workspace = (res.data as any)?.workspace as WorkspaceDto | undefined;
  if (!workspace?._id) {
    throw new Error("Invalid update workspace response");
  }
  return workspace;
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  await api.delete(`/api/workspaces/${workspaceId}`);
}

import api from "./api";

export type WorkspaceMemberUserDto = {
  _id: string;
  name: string;
  email: string;
  avatarUrl?: string;
};

export type WorkspaceMemberDto = {
  userId: string;
  role: "admin" | "member" | "guest";
  joinedAt?: string;
  user: WorkspaceMemberUserDto | null;
};

export async function listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberDto[]> {
  const res = await api.get(`/api/workspaces/${workspaceId}/members`);
  const members = (res.data as any)?.members;
  return Array.isArray(members) ? (members as WorkspaceMemberDto[]) : [];
}

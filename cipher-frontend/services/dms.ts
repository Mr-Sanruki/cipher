import api from "./api";

export type DirectMessageDto = {
  _id: string;
  type: "direct" | "group";
  participants: {
    userId: string;
    role?: "admin" | "member";
    user?: { _id: string; name: string; avatarUrl?: string; status?: "online" | "offline" | "away" } | null;
    joinedAt?: string;
    lastReadAt?: string;
  }[];
  name?: string;
  createdBy?: string;
  workspaceId?: string | null;
  lastMessageAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export async function listDms(workspaceId?: string | null): Promise<DirectMessageDto[]> {
  const res = await api.get("/api/dms", {
    params: workspaceId ? { workspaceId } : undefined,
  });
  const dms = (res.data as any)?.dms;
  return Array.isArray(dms) ? (dms as DirectMessageDto[]) : [];
}

export async function getDm(dmId: string): Promise<DirectMessageDto> {
  const res = await api.get(`/api/dms/${dmId}`);
  const dm = (res.data as any)?.dm as DirectMessageDto | undefined;
  if (!dm?._id) throw new Error("Invalid DM response");
  return dm;
}

export async function createDirectDm(input: { userId: string; workspaceId?: string }): Promise<DirectMessageDto> {
  const res = await api.post("/api/dms", input);
  const dm = (res.data as any)?.dm as DirectMessageDto | undefined;
  if (!dm?._id) throw new Error("Invalid create DM response");
  return dm;
}

export async function createGroupDm(input: {
  userIds: string[];
  name?: string;
  workspaceId?: string;
}): Promise<DirectMessageDto> {
  const res = await api.post("/api/dms", input);
  const dm = (res.data as any)?.dm as DirectMessageDto | undefined;
  if (!dm?._id) throw new Error("Invalid create group DM response");
  return dm;
}

export async function renameGroupDm(dmId: string, name: string): Promise<DirectMessageDto> {
  const res = await api.patch(`/api/dms/${dmId}/name`, { name });
  const dm = (res.data as any)?.dm as DirectMessageDto | undefined;
  if (!dm?._id) throw new Error("Invalid rename group response");
  return dm;
}

export async function addGroupMembers(dmId: string, userIds: string[]): Promise<DirectMessageDto> {
  const res = await api.post(`/api/dms/${dmId}/members`, { userIds });
  const dm = (res.data as any)?.dm as DirectMessageDto | undefined;
  if (!dm?._id) throw new Error("Invalid add members response");
  return dm;
}

export async function removeGroupMember(dmId: string, userId: string): Promise<DirectMessageDto> {
  const res = await api.delete(`/api/dms/${dmId}/members/${userId}`);
  const dm = (res.data as any)?.dm as DirectMessageDto | undefined;
  if (!dm?._id) throw new Error("Invalid remove member response");
  return dm;
}

export async function setGroupMemberRole(
  dmId: string,
  input: { userId: string; role: "admin" | "member" },
): Promise<DirectMessageDto> {
  const res = await api.patch(`/api/dms/${dmId}/admins`, input);
  const dm = (res.data as any)?.dm as DirectMessageDto | undefined;
  if (!dm?._id) throw new Error("Invalid update admin response");
  return dm;
}

export async function leaveGroupDm(dmId: string): Promise<void> {
  await api.post(`/api/dms/${dmId}/leave`, {});
}

export async function archiveDm(dmId: string): Promise<void> {
  await api.post(`/api/dms/${dmId}/archive`, {});
}

export async function deleteDm(dmId: string): Promise<void> {
  await api.delete(`/api/dms/${dmId}`);
}

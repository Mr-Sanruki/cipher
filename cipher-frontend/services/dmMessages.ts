import api from "./api";

export type DmMessageDto = {
  _id: string;
  dmId: string;
  sender: { _id: string; name: string; avatarUrl?: string };
  text: string;
  attachments: { url: string; type: string; name?: string; size?: number }[];
  reactions?: { emoji: string; userId: string }[];
  readBy?: { userId: string; readAt?: string }[];
  editedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  threadRootId?: string | null;
  replyCount?: number;
};

export async function listDmMessages(
  dmId: string,
  options?: { limit?: number; offset?: number }
): Promise<{ messages: DmMessageDto[]; total: number }> {
  const res = await api.get(`/api/dms/${dmId}/messages`, {
    params: {
      limit: options?.limit ?? 50,
      offset: options?.offset ?? 0,
    },
  });

  const messages = (res.data as any)?.messages;
  const total = Number((res.data as any)?.total ?? 0);

  return {
    messages: Array.isArray(messages) ? (messages as DmMessageDto[]) : [],
    total,
  };
}

export async function createDmMessage(input: {
  dmId: string;
  text: string;
  attachments?: { url: string; type: string; name?: string; size?: number }[];
  threadRootId?: string;
}): Promise<DmMessageDto> {
  const res = await api.post("/api/dms/messages", {
    dmId: input.dmId,
    text: input.text,
    attachments: input.attachments ?? [],
    threadRootId: input.threadRootId ?? "",
  });

  const message = (res.data as any)?.message as DmMessageDto | undefined;
  if (!message?._id) {
    throw new Error("Invalid send DM response");
  }
  return message;
}

export async function getDmThread(
  threadRootId: string,
  options?: { limit?: number; offset?: number },
): Promise<{ root: DmMessageDto; replies: DmMessageDto[]; total: number }> {
  const res = await api.get(`/api/dms/thread/${threadRootId}`, {
    params: { limit: options?.limit ?? 50, offset: options?.offset ?? 0 },
  });
  const root = (res.data as any)?.root as DmMessageDto | undefined;
  const replies = (res.data as any)?.replies;
  const total = Number((res.data as any)?.total ?? 0);
  if (!root?._id) throw new Error("Invalid thread response");
  return { root, replies: Array.isArray(replies) ? (replies as DmMessageDto[]) : [], total };
}

export async function updateDmMessage(input: { messageId: string; text: string }): Promise<DmMessageDto> {
  const res = await api.put(`/api/dms/messages/${input.messageId}`, { text: input.text });
  const message = (res.data as any)?.message as DmMessageDto | undefined;
  if (!message?._id) {
    throw new Error("Invalid update DM response");
  }
  return message;
}

export async function deleteDmMessage(messageId: string): Promise<void> {
  await api.delete(`/api/dms/messages/${messageId}`);
}

export async function reactDmMessage(input: { messageId: string; emoji: string }): Promise<{ emoji: string; userId: string }[]> {
  const res = await api.post(`/api/dms/messages/${input.messageId}/reactions`, { emoji: input.emoji });
  const reactions = (res.data as any)?.reactions;
  return Array.isArray(reactions) ? (reactions as any[]) : [];
}

import api from "./api";
import type { ChatMessageDto } from "../types";

export async function listMessages(
  channelId: string,
  options?: { limit?: number; offset?: number }
): Promise<{ messages: ChatMessageDto[]; total: number }> {
  const res = await api.get(`/api/messages/${channelId}`, {
    params: {
      limit: options?.limit ?? 50,
      offset: options?.offset ?? 0,
    },
  });

  const messages = (res.data as any)?.messages;
  const total = Number((res.data as any)?.total ?? 0);

  return {
    messages: Array.isArray(messages) ? (messages as ChatMessageDto[]) : [],
    total,
  };
}

export async function createMessage(input: {
  channelId: string;
  text: string;
  attachments?: { url: string; type: string; name?: string; size?: number }[];
  threadRootId?: string;
}): Promise<ChatMessageDto> {
  const res = await api.post("/api/messages", input);
  const message = (res.data as any)?.message as ChatMessageDto | undefined;

  if (!message?._id) {
    throw new Error("Invalid create message response");
  }

  return message;
}

export async function getThread(
  threadRootId: string,
  options?: { limit?: number; offset?: number },
): Promise<{ root: ChatMessageDto; replies: ChatMessageDto[]; total: number }> {
  const res = await api.get(`/api/messages/thread/${threadRootId}`, {
    params: { limit: options?.limit ?? 50, offset: options?.offset ?? 0 },
  });
  const root = (res.data as any)?.root as ChatMessageDto | undefined;
  const replies = (res.data as any)?.replies;
  const total = Number((res.data as any)?.total ?? 0);
  if (!root?._id) throw new Error("Invalid thread response");
  return { root, replies: Array.isArray(replies) ? (replies as ChatMessageDto[]) : [], total };
}

export async function updateMessage(input: { messageId: string; text: string }): Promise<ChatMessageDto> {
  const res = await api.put(`/api/messages/${input.messageId}`, { text: input.text });
  const message = (res.data as any)?.message as ChatMessageDto | undefined;
  if (!message?._id) {
    throw new Error("Invalid update message response");
  }
  return message;
}

export async function deleteMessage(messageId: string): Promise<void> {
  await api.delete(`/api/messages/${messageId}`);
}

export async function reactMessage(input: { messageId: string; emoji: string }): Promise<{ emoji: string; userId: string }[]> {
  const res = await api.post(`/api/messages/${input.messageId}/reactions`, { emoji: input.emoji });
  const reactions = (res.data as any)?.reactions;
  return Array.isArray(reactions) ? (reactions as any[]) : [];
}

export async function pinMessage(messageId: string): Promise<ChatMessageDto> {
  const res = await api.post(`/api/messages/${messageId}/pin`);
  const message = (res.data as any)?.message as ChatMessageDto | undefined;
  if (!message?._id) {
    throw new Error("Invalid pin message response");
  }
  return message;
}

export async function unpinMessage(messageId: string): Promise<void> {
  await api.post(`/api/messages/${messageId}/unpin`);
}

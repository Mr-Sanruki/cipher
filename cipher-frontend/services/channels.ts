import api from "./api";
import type { ChannelDto } from "../types";

export type ChannelMemberUserDto = {
  _id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  status?: "online" | "offline" | "away";
};

export type ChannelMemberWithUserDto = {
  userId: string;
  user: ChannelMemberUserDto | null;
};

export type ChannelDetailsDto = ChannelDto & {
  members?: ChannelMemberWithUserDto[];
};

export async function listChannels(workspaceId: string): Promise<ChannelDto[]> {
  const res = await api.get("/api/channels", {
    params: { workspaceId },
  });

  const channels = (res.data as any)?.channels;
  return Array.isArray(channels) ? (channels as ChannelDto[]) : [];
}

export async function createChannel(input: {
  workspaceId: string;
  name: string;
  description?: string;
  isPrivate?: boolean;
}): Promise<ChannelDto> {
  const res = await api.post("/api/channels", input);
  const channel = (res.data as any)?.channel as ChannelDto | undefined;

  if (!channel?._id) {
    throw new Error("Invalid create channel response");
  }

  return channel;
}

export async function updateChannel(
  channelId: string,
  input: {
    name?: string;
    description?: string;
    isPrivate?: boolean;
    postingPolicy?: "everyone" | "admins_only";
  },
): Promise<ChannelDto> {
  const res = await api.put(`/api/channels/${channelId}`, input);
  const channel = (res.data as any)?.channel as ChannelDto | undefined;
  if (!channel?._id) throw new Error("Invalid update channel response");
  return channel;
}

export async function getChannel(channelId: string): Promise<ChannelDetailsDto> {
  const res = await api.get(`/api/channels/${channelId}`);
  const channel = (res.data as any)?.channel as ChannelDetailsDto | undefined;
  if (!channel?._id) throw new Error("Invalid channel response");
  return channel;
}

export async function deleteChannel(channelId: string): Promise<void> {
  await api.delete(`/api/channels/${channelId}`);
}

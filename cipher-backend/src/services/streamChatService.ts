import { StreamChat } from "stream-chat";
import { env } from "../config/env";
import { HttpError } from "../middleware/errorHandler";
import { User } from "../models/User";

function requireStreamConfig(): { apiKey: string; apiSecret: string } {
  const apiKey = env.STREAM_API_KEY.trim();
  const apiSecret = (env.STREAM_API_SECRET || env.STREAM_SECRET).trim();

  if (!apiKey || !apiSecret) {
    throw new HttpError(500, "Stream is not configured. Set STREAM_API_KEY and STREAM_API_SECRET (or STREAM_SECRET).", {
      required: ["STREAM_API_KEY", "STREAM_API_SECRET"],
    });
  }

  return { apiKey, apiSecret };
}

function getServerClient(): StreamChat {
  const { apiKey, apiSecret } = requireStreamConfig();
  return StreamChat.getInstance(apiKey, apiSecret);
}

async function upsertStreamUsers(userIds: string[]): Promise<void> {
  const unique = Array.from(new Set(userIds.map((id) => String(id)).filter(Boolean)));
  if (unique.length === 0) return;

  const users = await User.find({ _id: { $in: unique } }).lean();

  const payload: any[] = users.map((u) => ({
    id: String((u as any)._id),
    name: String((u as any).name ?? ""),
    image: (u as any).avatarUrl ? String((u as any).avatarUrl) : undefined,
  }));

  if (payload.length === 0) return;

  const client = getServerClient();
  await client.upsertUsers(payload as any);
}

export function streamWorkspaceChannelId(input: { workspaceId: string; channelId: string }): string {
  return `ws_${input.workspaceId}_ch_${input.channelId}`;
}

export function streamDmChannelId(input: { dmId: string }): string {
  return `dm_${input.dmId}`;
}

export async function ensureStreamChannelForWorkspaceChannel(input: {
  workspaceId: string;
  channelId: string;
  name: string;
  isPrivate: boolean;
  memberIds: string[];
  createdById: string;
}): Promise<void> {
  const client = getServerClient();

  await upsertStreamUsers(input.memberIds);

  const id = streamWorkspaceChannelId({ workspaceId: input.workspaceId, channelId: input.channelId });

  const channel = (client as any).channel("messaging", id, {
    created_by_id: input.createdById,
  });

  try {
    await (channel as any).create();
  } catch (error: any) {
    const status = error?.response?.status;
    if (status !== 409) throw error;
  }

  try {
    await channel.addMembers(input.memberIds);
  } catch {
    // ignore
  }

  try {
    await (channel as any).updatePartial({
      set: {
        name: input.name,
        workspaceId: input.workspaceId,
        cipherChannelId: input.channelId,
        isPrivate: input.isPrivate,
      },
    });
  } catch {
    // ignore
  }
}

export async function ensureStreamChannelForDirectMessage(input: {
  dmId: string;
  workspaceId?: string | null;
  type: "direct" | "group";
  name?: string;
  participantIds: string[];
  createdById: string;
}): Promise<void> {
  const client = getServerClient();

  await upsertStreamUsers(input.participantIds);

  const id = streamDmChannelId({ dmId: input.dmId });

  const channel = (client as any).channel("messaging", id, {
    created_by_id: input.createdById,
  });

  try {
    await (channel as any).create();
  } catch (error: any) {
    const status = error?.response?.status;
    if (status !== 409) throw error;
  }

  try {
    await channel.addMembers(input.participantIds);
  } catch {
    // ignore
  }

  try {
    await (channel as any).updatePartial({
      set: {
        name: input.type === "group" ? input.name ?? "" : "",
        workspaceId: input.workspaceId ?? null,
        cipherDmId: input.dmId,
        dmType: input.type,
      },
    });
  } catch {
    // ignore
  }
}

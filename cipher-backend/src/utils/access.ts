import mongoose from "mongoose";
import { HttpError } from "../middleware/errorHandler";
import { Channel } from "../models/Channel";
import { Workspace } from "../models/Workspace";

export type WorkspaceRole = "admin" | "member" | "guest";

export async function requireWorkspaceMember(input: { userId: string; workspaceId: string }) {
  if (!mongoose.isValidObjectId(input.workspaceId)) {
    throw new HttpError(400, "Invalid workspaceId");
  }

  const workspace = await Workspace.findById(input.workspaceId);
  if (!workspace) {
    throw new HttpError(404, "Workspace not found");
  }

  const member = (workspace.members as any[]).find((m) => String(m.userId) === input.userId);
  if (!member) {
    throw new HttpError(403, "Not a workspace member");
  }

  return { workspace, role: member.role as WorkspaceRole };
}

export function requireWorkspaceAdmin(role: WorkspaceRole): void {
  if (role !== "admin") {
    throw new HttpError(403, "Admin permissions required");
  }
}

export async function requireChannelMember(input: { userId: string; channelId: string }) {
  if (!mongoose.isValidObjectId(input.channelId)) {
    throw new HttpError(400, "Invalid channelId");
  }

  const channel = await Channel.findById(input.channelId);
  if (!channel) {
    throw new HttpError(404, "Channel not found");
  }

  const member = (channel.members as any[]).find((m) => String(m.userId) === input.userId);

  if (channel.isPrivate) {
    if (!member) {
      throw new HttpError(403, "Not a channel member");
    }

    return { channel };
  }

  const workspace = await Workspace.findById(channel.workspaceId).select({ members: 1 });
  if (!workspace) {
    throw new HttpError(404, "Workspace not found");
  }

  const wsMember = (workspace.members as any[]).find((m) => String(m.userId) === input.userId);
  if (!wsMember) {
    throw new HttpError(403, "Not a workspace member");
  }

  if (!member) {
    await Channel.updateOne(
      { _id: channel._id },
      {
        $addToSet: { members: { userId: input.userId } },
      }
    );
    (channel.members as any[]).push({ userId: input.userId } as any);
  }

  return { channel };
}

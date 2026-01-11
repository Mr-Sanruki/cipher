import type { Response, NextFunction } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import type { AuthenticatedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { Channel } from "../models/Channel";
import { Message } from "../models/Message";
import { Workspace } from "../models/Workspace";
import { requireWorkspaceAdmin, requireWorkspaceMember } from "../utils/access";
import { requireChannelMember } from "../utils/access";
import { User } from "../models/User";
import { ensureStreamChannelForWorkspaceChannel } from "../services/streamChatService";

export const createChannelBodySchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(2).max(60),
  isPrivate: z.boolean().optional().default(false),
  description: z.string().max(500).optional().default(""),
});

export const updateChannelBodySchema = z.object({
  name: z.string().min(2).max(60).optional(),
  description: z.string().max(500).optional(),
  isPrivate: z.boolean().optional(),
  postingPolicy: z.enum(["everyone", "admins_only"]).optional(),
});

export const addMemberBodySchema = z.object({
  userId: z.string().min(1),
});

export async function createChannel(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = createChannelBodySchema.parse(req.body);

    const { workspace, role } = await requireWorkspaceMember({ userId: req.userId, workspaceId: body.workspaceId });
    requireWorkspaceAdmin(role);

    const name = normalizeChannelName(body.name);

    const memberIds = body.isPrivate
      ? [req.userId]
      : (workspace.members as any[]).map((m) => String(m.userId));

    const channel = await Channel.create({
      workspaceId: workspace._id,
      name,
      description: body.description ?? "",
      isPrivate: body.isPrivate,
      type: "channel",
      createdBy: req.userId,
      members: memberIds.map((id) => ({ userId: id })),
    });

    await ensureStreamChannelForWorkspaceChannel({
      workspaceId: String(workspace._id),
      channelId: String(channel._id),
      name: channel.name,
      isPrivate: Boolean(channel.isPrivate),
      memberIds,
      createdById: req.userId,
    });

    res.status(201).json({ channel: channel.toJSON() });
  } catch (error) {
    next(error);
  }
}

export async function getChannel(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const channelId = String(req.params.channelId ?? "");
    if (!mongoose.isValidObjectId(channelId)) {
      throw new HttpError(400, "Invalid channelId");
    }

    const { channel } = await requireChannelMember({ userId: req.userId, channelId });
    const workspaceId = String((channel as any).workspaceId);

    const workspace = await Workspace.findById(workspaceId).select({ members: 1 }).lean();
    if (!workspace) throw new HttpError(404, "Workspace not found");

    const memberIds = (channel as any).isPrivate
      ? Array.from(new Set((((channel as any).members as any[]) ?? []).map((m) => String(m.userId)).filter(Boolean)))
      : Array.from(new Set((((workspace as any).members as any[]) ?? []).map((m) => String(m.userId)).filter(Boolean)));

    const users = memberIds.length > 0 ? await User.find({ _id: { $in: memberIds } }).lean() : [];
    const userMap = new Map(users.map((u) => [String((u as any)._id), u]));

    res.json({
      channel: {
        ...((channel as any).toJSON ? (channel as any).toJSON() : channel),
        members: memberIds.map((id) => {
          const u = userMap.get(id);
          return {
            userId: id,
            user: u
              ? {
                  _id: String((u as any)._id),
                  name: String((u as any).name ?? ""),
                  email: String((u as any).email ?? ""),
                  avatarUrl: String((u as any).avatarUrl ?? ""),
                  status: (u as any).status ?? "offline",
                }
              : null,
          };
        }),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function listChannels(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const workspaceId = String(req.query.workspaceId ?? "");
    if (!mongoose.isValidObjectId(workspaceId)) {
      throw new HttpError(400, "workspaceId is required");
    }

    const { workspace } = await requireWorkspaceMember({ userId: req.userId, workspaceId });
    const workspaceMemberCount = Array.isArray(workspace.members) ? (workspace.members as any[]).length : 0;

    const channels = await Channel.find({
      workspaceId,
      $or: [{ isPrivate: false }, { "members.userId": req.userId }],
    }).sort({ updatedAt: -1 });

    const channelIds = channels.map((c) => c._id);
    const messageCounts =
      channelIds.length > 0
        ? await Message.aggregate([
            { $match: { channelId: { $in: channelIds }, deletedAt: null } },
            { $group: { _id: "$channelId", count: { $sum: 1 } } },
          ])
        : [];
    const messageCountByChannel = new Map(messageCounts.map((r: any) => [String(r._id), Number(r.count ?? 0)]));

    res.json({
      channels: channels.map((c) => {
        const json = c.toJSON();
        const memberCount = c.isPrivate ? (c.members as any[]).length : workspaceMemberCount;
        const messageCount = messageCountByChannel.get(String(c._id)) ?? 0;
        return { ...json, memberCount, messageCount };
      }),
    });
  } catch (error) {
    next(error);
  }
}

export async function updateChannel(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = updateChannelBodySchema.parse(req.body);

    const channel = await Channel.findById(req.params.channelId);
    if (!channel) throw new HttpError(404, "Channel not found");

    const { role } = await requireWorkspaceMember({ userId: req.userId, workspaceId: String(channel.workspaceId) });
    requireWorkspaceAdmin(role);

    if (body.name !== undefined) channel.name = normalizeChannelName(body.name);
    if (body.description !== undefined) channel.description = body.description;
    if (body.isPrivate !== undefined) channel.isPrivate = body.isPrivate;
    if (body.postingPolicy !== undefined) (channel as any).postingPolicy = body.postingPolicy;

    await channel.save();

    res.json({ channel: channel.toJSON() });
  } catch (error) {
    next(error);
  }
}

export async function deleteChannel(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const channel = await Channel.findById(req.params.channelId);
    if (!channel) throw new HttpError(404, "Channel not found");

    const { role } = await requireWorkspaceMember({ userId: req.userId, workspaceId: String(channel.workspaceId) });
    const createdBy = String((channel as any).createdBy ?? "");
    const isCreator = createdBy && createdBy === req.userId;
    if (!isCreator) {
      requireWorkspaceAdmin(role);
    }

    await Channel.deleteOne({ _id: channel._id });

    res.json({ message: "Channel deleted" });
  } catch (error) {
    next(error);
  }
}

export async function addMember(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = addMemberBodySchema.parse(req.body);

    const channel = await Channel.findById(req.params.channelId);
    if (!channel) throw new HttpError(404, "Channel not found");

    const { role } = await requireWorkspaceMember({ userId: req.userId, workspaceId: String(channel.workspaceId) });
    requireWorkspaceAdmin(role);

    const targetUserId = String(body.userId);

    const workspace = await Workspace.findById(channel.workspaceId);
    if (!workspace) throw new HttpError(404, "Workspace not found");

    const isWorkspaceMember = (workspace.members as any[]).some((m) => String(m.userId) === targetUserId);
    if (!isWorkspaceMember) throw new HttpError(400, "User is not a workspace member");

    await Channel.updateOne(
      { _id: channel._id },
      {
        $addToSet: { members: { userId: targetUserId } },
      }
    );

    res.json({ message: "Member added" });
  } catch (error) {
    next(error);
  }
}

export async function removeMember(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const channel = await Channel.findById(req.params.channelId);
    if (!channel) throw new HttpError(404, "Channel not found");

    const { role } = await requireWorkspaceMember({ userId: req.userId, workspaceId: String(channel.workspaceId) });
    requireWorkspaceAdmin(role);

    const targetUserId = String(req.params.userId);

    await Channel.updateOne(
      { _id: channel._id },
      {
        $pull: { members: { userId: targetUserId } },
      }
    );

    res.json({ message: "Member removed" });
  } catch (error) {
    next(error);
  }
}

function normalizeChannelName(input: string): string {
  const raw = input.trim().toLowerCase().replace(/^#/, "");
  const clean = raw.replace(/\s+/g, "-");
  if (!/^[a-z0-9][a-z0-9-_]{1,59}$/.test(clean)) {
    throw new HttpError(400, "Invalid channel name");
  }
  return clean;
}

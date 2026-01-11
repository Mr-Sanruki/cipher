import type { Response, NextFunction } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import type { AuthenticatedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { Channel } from "../models/Channel";
import { Message } from "../models/Message";
import { User } from "../models/User";
import { Workspace } from "../models/Workspace";
import { getIo } from "../socket";
import { requireChannelMember } from "../utils/access";
import { requireWorkspaceMember } from "../utils/access";
import { parseMentions } from "../utils/mentions";

export const createMessageBodySchema = z.object({
  channelId: z.string().min(1),
  text: z.string().max(8000).optional().default(""),
  attachments: z
    .array(
      z.object({
        url: z.string().url(),
        type: z.string().min(1),
        name: z.string().optional().default(""),
        size: z.number().int().nonnegative().optional().default(0),
      }),
    )
    .optional()
    .default([]),
  threadRootId: z.string().optional().default(""),
});

export const updateMessageBodySchema = z.object({
  text: z.string().min(1).max(8000),
});

export const reactBodySchema = z.object({
  emoji: z.string().min(1).max(16),
});

export async function createMessage(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = createMessageBodySchema.parse(req.body);

    if (!mongoose.isValidObjectId(body.channelId)) {
      throw new HttpError(400, "Invalid channelId");
    }

    const { channel } = await requireChannelMember({ userId: req.userId, channelId: body.channelId });

    const postingPolicy = String((channel as any).postingPolicy ?? "everyone");
    if (postingPolicy === "admins_only") {
      const { role } = await requireWorkspaceMember({ userId: req.userId, workspaceId: String((channel as any).workspaceId) });
      const isCreator = String((channel as any).createdBy) === req.userId;
      if (role !== "admin" && !isCreator) {
        throw new HttpError(403, "Only admins can send messages in this channel");
      }
    }

    const trimmed = (body.text ?? "").trim();
    if (!trimmed && body.attachments.length === 0) {
      throw new HttpError(400, "Message cannot be empty");
    }

    const threadRootIdRaw = String(body.threadRootId ?? "").trim();
    let threadRootId: string | null = null;
    if (threadRootIdRaw) {
      if (!mongoose.isValidObjectId(threadRootIdRaw)) {
        throw new HttpError(400, "Invalid threadRootId");
      }

      const root = await Message.findById(threadRootIdRaw).select({
        _id: 1,
        channelId: 1,
        threadRootId: 1,
        deletedAt: 1,
      });
      if (!root) {
        throw new HttpError(404, "Thread root message not found");
      }

      if (String(root.channelId) !== String(channel._id)) {
        throw new HttpError(400, "Thread root message is not in this channel");
      }

      if (root.threadRootId) {
        throw new HttpError(400, "threadRootId must reference a root message");
      }

      if (root.deletedAt) {
        throw new HttpError(400, "Thread root message deleted");
      }

      threadRootId = threadRootIdRaw;
    }

    // Parse mentions from text
    const workspace = await Workspace.findById(channel.workspaceId).select({ _id: 1 }).lean();
    const workspaceId = workspace ? String((workspace as any)._id) : null;
    const { userIds: mentionIds } = workspaceId ? await parseMentions(trimmed, workspaceId) : { userIds: [] };

    const message = await Message.create({
      channelId: channel._id,
      senderId: req.userId,
      text: trimmed,
      attachments: body.attachments,
      reactions: [],
      readBy: [{ userId: req.userId }],
      editedAt: null,
      deletedAt: null,
      threadRootId,
      mentions: mentionIds,
    });

    const sender = await User.findById(req.userId).lean();

    const dto = toMessageDto(message, sender);

    getIo().to(String(channel._id)).emit("receive-message", { message: dto });

    res.status(201).json({ id: String(message._id), message: dto });
  } catch (error) {
    next(error);
  }
}

export async function listMessages(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const channelId = String(req.params.channelId);
    const limitRaw = Number(req.query.limit);
    const offsetRaw = Number(req.query.offset);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 100) : 50;
    const offset = Number.isFinite(offsetRaw) ? Math.max(Math.floor(offsetRaw), 0) : 0;

    if (!mongoose.isValidObjectId(channelId)) {
      throw new HttpError(400, "Invalid channelId");
    }

    await requireChannelMember({ userId: req.userId, channelId });

    const [messages, total] = await Promise.all([
      Message.find({ channelId, threadRootId: null }).sort({ createdAt: -1 }).skip(offset).limit(limit),
      Message.countDocuments({ channelId, threadRootId: null }),
    ]);

    const rootIds = messages.map((m) => (m as any)._id).filter(Boolean);
    const replyCounts =
      rootIds.length > 0
        ? await Message.aggregate([
            { $match: { channelId: new mongoose.Types.ObjectId(channelId), threadRootId: { $in: rootIds } } },
            { $group: { _id: "$threadRootId", count: { $sum: 1 } } },
          ])
        : [];
    const replyCountByRootId = new Map(replyCounts.map((r: any) => [String(r._id), Number(r.count ?? 0)]));

    const userIds = Array.from(
      new Set(
        messages.flatMap((m) => {
          const readBy = Array.isArray((m as any).readBy) ? ((m as any).readBy as any[]) : [];
          const readByIds = readBy.map((r) => String((r as any)?.userId ?? ""))?.filter(Boolean) ?? [];
          return [String((m as any).senderId), ...readByIds];
        }),
      ),
    );
    const users = userIds.length > 0 ? await User.find({ _id: { $in: userIds } }).lean() : [];
    const userMap = new Map(users.map((u) => [String((u as any)._id), u]));

    res.json({
      messages: messages.map((m) => {
        const dto = toMessageDto(m, userMap.get(String((m as any).senderId)) ?? null, userMap);
        return { ...dto, replyCount: replyCountByRootId.get(String((m as any)._id)) ?? 0 };
      }),
      total,
    });
  } catch (error) {
    next(error);
  }
}

export async function getThread(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const threadRootIdParam = String(req.params.threadRootId);
    const limitRaw = Number(req.query.limit);
    const offsetRaw = Number(req.query.offset);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 100) : 50;
    const offset = Number.isFinite(offsetRaw) ? Math.max(Math.floor(offsetRaw), 0) : 0;

    if (!mongoose.isValidObjectId(threadRootIdParam)) {
      throw new HttpError(400, "Invalid threadRootId");
    }

    const candidate = await Message.findById(threadRootIdParam);
    if (!candidate) {
      throw new HttpError(404, "Thread not found");
    }

    const rootId = (candidate as any).threadRootId
      ? String((candidate as any).threadRootId)
      : String((candidate as any)._id);
    const root = rootId === String((candidate as any)._id) ? candidate : await Message.findById(rootId);
    if (!root) {
      throw new HttpError(404, "Thread not found");
    }

    if ((root as any).threadRootId) {
      throw new HttpError(400, "Thread root message is invalid");
    }

    await requireChannelMember({ userId: req.userId, channelId: String((root as any).channelId) });

    const [replies, total] = await Promise.all([
      Message.find({ channelId: (root as any).channelId, threadRootId: (root as any)._id })
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit),
      Message.countDocuments({ channelId: (root as any).channelId, threadRootId: (root as any)._id }),
    ]);

    const userIds = Array.from(
      new Set(
        [root, ...replies].flatMap((m) => {
          const readBy = Array.isArray((m as any).readBy) ? ((m as any).readBy as any[]) : [];
          const readByIds = readBy.map((r) => String((r as any)?.userId ?? ""))?.filter(Boolean) ?? [];
          return [String((m as any).senderId), ...readByIds];
        }),
      ),
    );
    const users = userIds.length > 0 ? await User.find({ _id: { $in: userIds } }).lean() : [];
    const userMap = new Map(users.map((u) => [String((u as any)._id), u]));

    const rootDto = toMessageDto(root, userMap.get(String((root as any).senderId)) ?? null, userMap);

    res.json({
      root: rootDto,
      replies: replies.map((m) => toMessageDto(m, userMap.get(String((m as any).senderId)) ?? null, userMap)),
      total,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateMessage(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = updateMessageBodySchema.parse(req.body);
    const messageId = String(req.params.messageId);

    if (!mongoose.isValidObjectId(messageId)) throw new HttpError(400, "Invalid messageId");

    const message = await Message.findById(messageId);
    if (!message) throw new HttpError(404, "Message not found");

    await requireChannelMember({ userId: req.userId, channelId: String(message.channelId) });

    if (String(message.senderId) !== req.userId) {
      throw new HttpError(403, "You can only edit your own messages");
    }

    if (message.deletedAt) {
      throw new HttpError(400, "Message deleted");
    }

    const trimmed = body.text.trim();
    if (!trimmed) {
      throw new HttpError(400, "Message cannot be empty");
    }

    message.text = trimmed;
    message.editedAt = new Date();
    await message.save();

    getIo()
      .to(String(message.channelId))
      .emit("message-edited", { messageId: String(message._id), text: message.text });

    const sender = await User.findById(req.userId).lean();

    res.json({ message: toMessageDto(message, sender) });
  } catch (error) {
    next(error);
  }
}

export async function deleteMessage(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const messageId = String(req.params.messageId);

    if (!mongoose.isValidObjectId(messageId)) throw new HttpError(400, "Invalid messageId");

    const message = await Message.findById(messageId);
    if (!message) throw new HttpError(404, "Message not found");

    await requireChannelMember({ userId: req.userId, channelId: String(message.channelId) });

    if (String(message.senderId) !== req.userId) {
      throw new HttpError(403, "You can only delete your own messages");
    }

    message.deletedAt = new Date();
    await message.save();

    getIo()
      .to(String(message.channelId))
      .emit("message-deleted", { messageId: String(message._id) });

    res.json({ message: "Message deleted" });
  } catch (error) {
    next(error);
  }
}

export async function reactMessage(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = reactBodySchema.parse(req.body);
    const messageId = String(req.params.messageId);

    if (!mongoose.isValidObjectId(messageId)) throw new HttpError(400, "Invalid messageId");

    const message = await Message.findById(messageId);
    if (!message) throw new HttpError(404, "Message not found");

    await requireChannelMember({ userId: req.userId, channelId: String(message.channelId) });

    const emoji = body.emoji;

    const existing = (message.reactions as any[]).find(
      (r) => r.emoji === emoji && String(r.userId) === req.userId,
    );

    if (existing) {
      message.reactions = (message.reactions as any[]).filter(
        (r) => !(r.emoji === emoji && String(r.userId) === req.userId),
      ) as any;
    } else {
      (message.reactions as any[]).push({ emoji, userId: req.userId });
    }

    await message.save();

    getIo()
      .to(String(message.channelId))
      .emit("message-reaction", { messageId: String(message._id), emoji, userId: req.userId });

    res.json({ reactions: message.reactions });
  } catch (error) {
    next(error);
  }
}

export async function pinMessage(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const messageId = String(req.params.messageId);

    if (!mongoose.isValidObjectId(messageId)) throw new HttpError(400, "Invalid messageId");

    const message = await Message.findById(messageId);
    if (!message) throw new HttpError(404, "Message not found");

    const { channel } = await requireChannelMember({
      userId: req.userId,
      channelId: String(message.channelId),
    });

    if (message.pinnedAt) {
      throw new HttpError(400, "Message already pinned");
    }

    message.pinnedAt = new Date();
    message.pinnedBy = req.userId;
    await message.save();

    getIo()
      .to(String(message.channelId))
      .emit("message-pinned", { messageId: String(message._id), pinnedBy: req.userId });

    const userIds = [String(message.senderId), String(req.userId)].filter(Boolean);
    const users = await User.find({ _id: { $in: userIds } }).lean();
    const userMap = new Map(users.map((u) => [String((u as any)._id), u]));

    const sender = userMap.get(String(message.senderId)) ?? null;
    res.json({ message: toMessageDto(message, sender, userMap) });
  } catch (error) {
    next(error);
  }
}

export async function unpinMessage(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const messageId = String(req.params.messageId);

    if (!mongoose.isValidObjectId(messageId)) throw new HttpError(400, "Invalid messageId");

    const message = await Message.findById(messageId);
    if (!message) throw new HttpError(404, "Message not found");

    await requireChannelMember({ userId: req.userId, channelId: String(message.channelId) });

    if (!message.pinnedAt) {
      throw new HttpError(400, "Message not pinned");
    }

    message.pinnedAt = null;
    message.pinnedBy = null;
    await message.save();

    getIo()
      .to(String(message.channelId))
      .emit("message-unpinned", { messageId: String(message._id) });

    res.json({ message: "Message unpinned" });
  } catch (error) {
    next(error);
  }
}

export async function getPinnedMessages(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const channelId = String(req.params.channelId);

    if (!mongoose.isValidObjectId(channelId)) {
      throw new HttpError(400, "Invalid channelId");
    }

    await requireChannelMember({ userId: req.userId, channelId });

    const messages = await Message.find({ channelId, pinnedAt: { $ne: null } })
      .sort({ pinnedAt: -1 })
      .limit(50);

    const userIds = Array.from(
      new Set(
        messages.flatMap((m) => {
          const readBy = Array.isArray((m as any).readBy) ? ((m as any).readBy as any[]) : [];
          const readByIds = readBy.map((r) => String((r as any)?.userId ?? ""))?.filter(Boolean) ?? [];
          return [String((m as any).senderId), String((m as any).pinnedBy), ...readByIds].filter(Boolean);
        }),
      ),
    );
    const users = userIds.length > 0 ? await User.find({ _id: { $in: userIds } }).lean() : [];
    const userMap = new Map(users.map((u) => [String((u as any)._id), u]));

    res.json({
      messages: messages.map((m) =>
        toMessageDto(m, userMap.get(String((m as any).senderId)) ?? null, userMap),
      ),
    });
  } catch (error) {
    next(error);
  }
}

export async function searchMessages(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) {
      throw new HttpError(400, "Query too short");
    }

    const workspaces = await Workspace.find({ "members.userId": req.userId }).select({ _id: 1 }).lean();
    const workspaceIds = workspaces.map((w) => w._id);

    const channels = await Channel.find({
      workspaceId: { $in: workspaceIds },
      $or: [{ isPrivate: false }, { "members.userId": req.userId }],
    })
      .select({ _id: 1 })
      .lean();
    const channelIds = channels.map((c) => c._id);

    const results = await Message.find({
      channelId: { $in: channelIds },
      deletedAt: null,
      text: { $regex: escapeRegExp(q), $options: "i" },
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const userIds = Array.from(
      new Set(
        results.flatMap((m) => {
          const readBy = Array.isArray((m as any).readBy) ? ((m as any).readBy as any[]) : [];
          const readByIds = readBy.map((r) => String((r as any)?.userId ?? ""))?.filter(Boolean) ?? [];
          return [String((m as any).senderId), ...readByIds];
        }),
      ),
    );
    const users = userIds.length > 0 ? await User.find({ _id: { $in: userIds } }).lean() : [];
    const userMap = new Map(users.map((u) => [String((u as any)._id), u]));

    res.json({
      results: results.map((m) => toMessageDto(m, userMap.get(String((m as any).senderId)) ?? null, userMap)),
    });
  } catch (error) {
    next(error);
  }
}

export async function markReadFromSocket(input: { userId: string; messageId: string }): Promise<void> {
  if (!mongoose.isValidObjectId(input.messageId)) return;

  const message = await Message.findById(input.messageId);
  if (!message) return;

  const already = (message.readBy as any[]).some((r) => String(r.userId) === input.userId);
  if (already) return;

  (message.readBy as any[]).push({ userId: input.userId, readAt: new Date() });
  await message.save();

  const reader = await User.findById(input.userId).lean();
  const readerDto = reader
    ? {
        _id: String((reader as any)._id),
        name: String((reader as any).name ?? ""),
        avatarUrl: String((reader as any).avatarUrl ?? ""),
      }
    : { _id: input.userId, name: "", avatarUrl: "" };

  getIo()
    .to(String(message.channelId))
    .emit("message-read", { messageId: String(message._id), user: readerDto });
}

function toMessageDto(message: any, sender: any | null, userMap?: Map<string, any>) {
  const senderDto = sender
    ? { _id: String(sender._id), name: String(sender.name ?? ""), avatarUrl: String(sender.avatarUrl ?? "") }
    : { _id: String(message.senderId), name: "", avatarUrl: "" };

  const readBy = Array.isArray(message.readBy) ? (message.readBy as any[]) : [];
  const readByUsers = readBy.map((r) => {
    const id = String((r as any)?.userId ?? "");
    const u = userMap?.get(id) ?? (sender && String(sender._id) === id ? sender : null);
    if (u) {
      return {
        _id: String((u as any)._id),
        name: String((u as any).name ?? ""),
        avatarUrl: String((u as any).avatarUrl ?? ""),
      };
    }
    return { _id: id, name: "", avatarUrl: "" };
  });

  const pinnedByUser = message.pinnedBy && userMap?.get(String(message.pinnedBy));
  const pinnedByDto = pinnedByUser
    ? {
        _id: String(pinnedByUser._id),
        name: String(pinnedByUser.name ?? ""),
        avatarUrl: String(pinnedByUser.avatarUrl ?? ""),
      }
    : null;

  return {
    _id: String(message._id),
    channelId: String(message.channelId),
    sender: senderDto,
    text: message.deletedAt ? "" : String(message.text ?? ""),
    attachments: message.attachments ?? [],
    reactions: message.reactions ?? [],
    readBy: readBy.map((r) => ({ userId: String((r as any)?.userId ?? ""), readAt: (r as any)?.readAt })),
    readByUsers,
    editedAt: message.editedAt,
    deletedAt: message.deletedAt,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    threadRootId: message.threadRootId ? String(message.threadRootId) : null,
    pinnedAt: message.pinnedAt,
    pinnedBy: message.pinnedBy ? String(message.pinnedBy) : null,
    pinnedByUser: pinnedByDto,
    mentions: message.mentions ? (message.mentions as any[]).map((m) => String(m)) : [],
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

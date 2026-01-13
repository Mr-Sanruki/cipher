import type { Response, NextFunction } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import type { AuthenticatedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { DirectMessage } from "../models/DirectMessage";
import { DirectMessageContent } from "../models/DirectMessageContent";
import { User } from "../models/User";
import { Workspace } from "../models/Workspace";
import { getIo } from "../socket";
import { parseMentions } from "../utils/mentions";
import { ensureStreamChannelForDirectMessage } from "../services/streamChatService";

export const createDirectMessageBodySchema = z.object({
  userId: z.string().optional(), // For 1:1 DM
  userIds: z.array(z.string()).optional(), // For group DM
  name: z.string().optional(), // For group DM
  workspaceId: z.string().optional(),
});

export const createDirectMessageContentBodySchema = z.object({
  dmId: z.string().min(1),
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
  poll: z
    .object({
      question: z.string().min(1).max(240),
      options: z.array(z.string().min(1).max(120)).min(2).max(6),
    })
    .optional(),
});

export const updateDirectMessageContentBodySchema = z.object({
  text: z.string().min(1).max(8000),
});

export const reactDirectMessageBodySchema = z.object({
  emoji: z.string().min(1).max(16),
});

export const votePollBodySchema = z.object({
  optionIndex: z.number().int().min(0).max(10),
});

export const renameGroupBodySchema = z.object({
  name: z.string().min(1).max(60),
});

export const addGroupMembersBodySchema = z.object({
  userIds: z.array(z.string().min(1)).min(1),
});

export const updateGroupAdminBodySchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["admin", "member"]),
});

async function ensureDMParticipant(input: { userId: string; dmId: string }): Promise<any> {
  if (!mongoose.isValidObjectId(input.dmId)) {
    throw new HttpError(400, "Invalid dmId");
  }

  const dm = await DirectMessage.findById(input.dmId);
  if (!dm) {
    throw new HttpError(404, "Direct message not found");
  }

  const isParticipant = (dm.participants as any[]).some((p) => String(p.userId) === input.userId);
  if (!isParticipant) {
    throw new HttpError(403, "Not a participant in this DM");
  }

  return dm;
}

function ensureGroupDm(dm: any): void {
  if (!dm || String((dm as any).type) !== "group") {
    throw new HttpError(400, "Not a group DM");
  }
}

function getParticipant(dm: any, userId: string): any {
  const p = ((dm as any).participants as any[])?.find((x) => String(x.userId) === String(userId));
  return p ?? null;
}

function requireGroupAdmin(dm: any, userId: string): void {
  const p = getParticipant(dm, userId);
  if (!p) throw new HttpError(403, "Not a participant in this DM");
  const role = String((p as any).role ?? "member");
  if (role !== "admin") {
    throw new HttpError(403, "Group admin permissions required");
  }
}

export async function archiveDirectMessage(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const dmId = String(req.params.dmId);
    if (!mongoose.isValidObjectId(dmId)) {
      throw new HttpError(400, "Invalid dmId");
    }

    const dm = await ensureDMParticipant({ userId: req.userId, dmId });

    await DirectMessage.updateOne(
      { _id: (dm as any)._id },
      {
        $addToSet: { archivedBy: req.userId },
      },
    );

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

export async function deleteDirectMessage(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const dmId = String(req.params.dmId);
    if (!mongoose.isValidObjectId(dmId)) {
      throw new HttpError(400, "Invalid dmId");
    }

    const dm = await ensureDMParticipant({ userId: req.userId, dmId });
    const type = String((dm as any).type ?? "direct");

    if (type === "direct") {
      // Direct DM delete = archive for me
      await DirectMessage.updateOne(
        { _id: (dm as any)._id },
        {
          $addToSet: { archivedBy: req.userId },
        },
      );
      res.json({ ok: true });
      return;
    }

    // Group delete = only creator or group admin
    ensureGroupDm(dm);
    const createdBy = String((dm as any).createdBy ?? "");
    if (createdBy !== req.userId) {
      requireGroupAdmin(dm, req.userId);
    }

    // Delete group + its messages
    await Promise.all([
      DirectMessageContent.deleteMany({ dmId: (dm as any)._id }),
      DirectMessage.deleteOne({ _id: (dm as any)._id }),
    ]);

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

async function toDmDtoWithUsers(dm: any): Promise<any> {
  const ids = Array.from(new Set((((dm as any).participants as any[]) ?? []).map((p) => String(p.userId)).filter(Boolean)));
  const users = ids.length > 0 ? await User.find({ _id: { $in: ids } }).lean() : [];
  const userMap = new Map(users.map((u) => [String((u as any)._id), u]));
  return {
    _id: String((dm as any)._id),
    type: (dm as any).type,
    participants: (((dm as any).participants as any[]) ?? []).map((p) => ({
      userId: String(p.userId),
      role: String((p as any).role ?? "member"),
      user: userMap.get(String(p.userId))
        ? {
            _id: String((userMap.get(String(p.userId)) as any)._id),
            name: String((userMap.get(String(p.userId)) as any).name ?? ""),
            avatarUrl: String((userMap.get(String(p.userId)) as any).avatarUrl ?? ""),
            status: (userMap.get(String(p.userId)) as any).status ?? "offline",
          }
        : null,
      joinedAt: p.joinedAt,
      lastReadAt: p.lastReadAt,
    })),
    name: (dm as any).name || "",
    createdBy: String((dm as any).createdBy),
    workspaceId: (dm as any).workspaceId ? String((dm as any).workspaceId) : null,
    lastMessageAt: (dm as any).lastMessageAt,
    createdAt: (dm as any).createdAt,
    updatedAt: (dm as any).updatedAt,
  };
}

async function ensureDmContentForParticipant(input: { userId: string; messageId: string }): Promise<{ dm: any; content: any }> {
  if (!mongoose.isValidObjectId(input.messageId)) {
    throw new HttpError(400, "Invalid messageId");
  }

  const content = await DirectMessageContent.findById(input.messageId);
  if (!content) {
    throw new HttpError(404, "Message not found");
  }

  const dm = await ensureDMParticipant({ userId: input.userId, dmId: String((content as any).dmId) });
  return { dm, content };
}

async function toDmContentDto(content: any, sender: any | null): Promise<any> {
  const senderDto = sender
    ? {
        _id: String((sender as any)._id),
        name: String((sender as any).name ?? ""),
        avatarUrl: String((sender as any).avatarUrl ?? ""),
      }
    : { _id: String((content as any).senderId), name: "", avatarUrl: "" };

  const readBy = Array.isArray((content as any).readBy) ? ((content as any).readBy as any[]) : [];

  const poll = (content as any).poll;
  const pollDto = poll
    ? {
        question: String(poll.question ?? ""),
        options: Array.isArray(poll.options)
          ? (poll.options as any[]).map((o) => ({
              text: String((o as any).text ?? ""),
              votes: Array.isArray((o as any).votes) ? ((o as any).votes as any[]).map((v) => String(v)) : [],
            }))
          : [],
      }
    : null;

  return {
    _id: String((content as any)._id),
    dmId: String((content as any).dmId),
    sender: senderDto,
    text: (content as any).deletedAt ? "" : String((content as any).text ?? ""),
    attachments: (content as any).deletedAt ? [] : ((content as any).attachments ?? []),
    reactions: (content as any).reactions ?? [],
    poll: pollDto,
    readBy: readBy.map((r) => ({ userId: String((r as any).userId), readAt: (r as any).readAt })),
    editedAt: (content as any).editedAt,
    deletedAt: (content as any).deletedAt,
    createdAt: (content as any).createdAt,
    updatedAt: (content as any).updatedAt,
    threadRootId: (content as any).threadRootId ? String((content as any).threadRootId) : null,
    mentions: Array.isArray((content as any).mentions) ? ((content as any).mentions as any[]).map((id) => String(id)) : [],
  };
}

export async function updateDirectMessageContent(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = updateDirectMessageContentBodySchema.parse(req.body);
    const messageId = String(req.params.messageId);

    const { dm, content } = await ensureDmContentForParticipant({ userId: req.userId, messageId });

    if (String((content as any).senderId) !== req.userId) {
      throw new HttpError(403, "You can only edit your own messages");
    }
    if ((content as any).deletedAt) {
      throw new HttpError(400, "Message deleted");
    }

    const trimmed = body.text.trim();
    if (!trimmed) {
      throw new HttpError(400, "Message cannot be empty");
    }

    (content as any).text = trimmed;
    (content as any).editedAt = new Date();
    await content.save();

    const sender = await User.findById(req.userId).lean();
    const dto = await toDmContentDto(content, sender);

    const participantIds = (dm.participants as any[]).map((p) => String(p.userId));
    for (const pid of participantIds) {
      getIo().to(`dm:${pid}`).emit("receive-dm-message", { message: dto });
    }

    res.json({ message: dto });
  } catch (error) {
    next(error);
  }
}

export async function getDirectMessage(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const dmId = String(req.params.dmId);
    if (!mongoose.isValidObjectId(dmId)) {
      throw new HttpError(400, "Invalid dmId");
    }

    const dm = await DirectMessage.findById(dmId).lean();
    if (!dm) {
      throw new HttpError(404, "Direct message not found");
    }

    const isParticipant = ((dm as any).participants as any[])?.some((p) => String(p.userId) === req.userId);
    if (!isParticipant) {
      throw new HttpError(403, "Not a participant in this DM");
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.json({ dm: await toDmDtoWithUsers(dm) });
  } catch (error) {
    next(error);
  }
}

export async function renameGroup(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const dmId = String(req.params.dmId);
    const body = renameGroupBodySchema.parse(req.body);
    const dm = await ensureDMParticipant({ userId: req.userId, dmId });
    ensureGroupDm(dm);
    requireGroupAdmin(dm, req.userId);

    (dm as any).name = body.name.trim();
    await dm.save();
    res.json({ dm: await toDmDtoWithUsers(dm.toJSON()) });
  } catch (error) {
    next(error);
  }
}

export async function addGroupMembers(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const dmId = String(req.params.dmId);
    const body = addGroupMembersBodySchema.parse(req.body);
    const dm = await ensureDMParticipant({ userId: req.userId, dmId });
    ensureGroupDm(dm);
    requireGroupAdmin(dm, req.userId);

    const rawIds = body.userIds.map((x) => String(x));
    const userIds = Array.from(new Set(rawIds)).filter((x) => x && mongoose.isValidObjectId(x));
    if (userIds.length === 0) throw new HttpError(400, "No valid userIds");

    if ((dm as any).workspaceId) {
      const ws = await Workspace.findById(String((dm as any).workspaceId)).select({ members: 1 }).lean();
      if (!ws) throw new HttpError(404, "Workspace not found");
      for (const uid of userIds) {
        const ok = ((ws as any).members as any[]).some((m) => String(m.userId) === uid);
        if (!ok) throw new HttpError(400, "User is not a workspace member");
      }
    }

    const existingIds = new Set<string>(((dm as any).participants as any[]).map((p) => String(p.userId)));
    for (const uid of userIds) {
      if (existingIds.has(uid)) continue;
      (dm as any).participants.push({ userId: uid, role: "member", joinedAt: new Date(), lastReadAt: new Date() });
    }
    await dm.save();
    res.json({ dm: await toDmDtoWithUsers(dm.toJSON()) });
  } catch (error) {
    next(error);
  }
}

export async function removeGroupMember(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const dmId = String(req.params.dmId);
    const targetUserId = String(req.params.userId);
    const dm = await ensureDMParticipant({ userId: req.userId, dmId });
    ensureGroupDm(dm);
    requireGroupAdmin(dm, req.userId);

    if (!mongoose.isValidObjectId(targetUserId)) throw new HttpError(400, "Invalid userId");

    const participants = ((dm as any).participants as any[]) ?? [];
    const target = participants.find((p) => String(p.userId) === targetUserId);
    if (!target) {
      res.json({ dm: await toDmDtoWithUsers(dm.toJSON()) });
      return;
    }

    const targetRole = String((target as any).role ?? "member");
    if (targetRole === "admin") {
      const adminCount = participants.filter((p) => String((p as any).role ?? "member") === "admin").length;
      if (adminCount <= 1) {
        throw new HttpError(400, "Cannot remove the last admin");
      }
    }

    (dm as any).participants = participants.filter((p) => String(p.userId) !== targetUserId);
    await dm.save();
    res.json({ dm: await toDmDtoWithUsers(dm.toJSON()) });
  } catch (error) {
    next(error);
  }
}

export async function updateGroupAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const dmId = String(req.params.dmId);
    const body = updateGroupAdminBodySchema.parse(req.body);
    const dm = await ensureDMParticipant({ userId: req.userId, dmId });
    ensureGroupDm(dm);
    requireGroupAdmin(dm, req.userId);

    if (!mongoose.isValidObjectId(body.userId)) throw new HttpError(400, "Invalid userId");

    const participants = ((dm as any).participants as any[]) ?? [];
    const target = participants.find((p) => String(p.userId) === String(body.userId));
    if (!target) throw new HttpError(404, "User is not in this group");

    const currentRole = String((target as any).role ?? "member");
    const nextRole = String(body.role);
    if (currentRole === "admin" && nextRole !== "admin") {
      const adminCount = participants.filter((p) => String((p as any).role ?? "member") === "admin").length;
      if (adminCount <= 1) {
        throw new HttpError(400, "Cannot demote the last admin");
      }
    }

    (target as any).role = nextRole;
    await dm.save();
    res.json({ dm: await toDmDtoWithUsers(dm.toJSON()) });
  } catch (error) {
    next(error);
  }
}

export async function leaveGroup(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const dmId = String(req.params.dmId);
    const dm = await ensureDMParticipant({ userId: req.userId, dmId });
    ensureGroupDm(dm);

    const participants = ((dm as any).participants as any[]) ?? [];
    const me = participants.find((p) => String(p.userId) === req.userId);
    if (!me) throw new HttpError(403, "Not a participant in this DM");

    const myRole = String((me as any).role ?? "member");
    if (myRole === "admin") {
      const adminCount = participants.filter((p) => String((p as any).role ?? "member") === "admin").length;
      if (adminCount <= 1 && participants.length > 1) {
        throw new HttpError(400, "You are the last admin. Promote someone before leaving.");
      }
    }

    (dm as any).participants = participants.filter((p) => String(p.userId) !== req.userId);
    await dm.save();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

export async function deleteDirectMessageContent(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const messageId = String(req.params.messageId);
    const { dm, content } = await ensureDmContentForParticipant({ userId: req.userId, messageId });

    if (String((content as any).senderId) !== req.userId) {
      throw new HttpError(403, "You can only delete your own messages");
    }

    const dmId = String((content as any).dmId);
    const isRoot = !(content as any).threadRootId;

    if (isRoot) {
      const replyIds = await DirectMessageContent.find({ dmId: (content as any).dmId, threadRootId: (content as any)._id }).distinct("_id");
      await Promise.all([
        replyIds.length > 0 ? DirectMessageContent.deleteMany({ _id: { $in: replyIds } }) : Promise.resolve(),
        DirectMessageContent.deleteOne({ _id: (content as any)._id }),
      ]);

      const participantIds = (dm.participants as any[]).map((p) => String(p.userId));
      for (const pid of participantIds) {
        for (const rid of replyIds) {
          getIo().to(`dm:${pid}`).emit("dm-message-deleted", { dmId, messageId: String(rid) });
        }
        getIo().to(`dm:${pid}`).emit("dm-message-deleted", { dmId, messageId: String((content as any)._id) });
      }

      res.status(204).send();
      return;
    }

    await DirectMessageContent.deleteOne({ _id: (content as any)._id });

    const participantIds = (dm.participants as any[]).map((p) => String(p.userId));
    for (const pid of participantIds) {
      getIo().to(`dm:${pid}`).emit("dm-message-deleted", { dmId, messageId: String((content as any)._id) });
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function reactDirectMessageContent(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = reactDirectMessageBodySchema.parse(req.body);
    const messageId = String(req.params.messageId);
    const { dm, content } = await ensureDmContentForParticipant({ userId: req.userId, messageId });

    const emoji = body.emoji;
    const reactions = Array.isArray((content as any).reactions) ? ((content as any).reactions as any[]) : [];
    const existing = reactions.find((r) => r.emoji === emoji && String(r.userId) === req.userId);

    if (existing) {
      (content as any).reactions = reactions.filter((r) => !(r.emoji === emoji && String(r.userId) === req.userId));
    } else {
      reactions.push({ emoji, userId: req.userId });
      (content as any).reactions = reactions;
    }

    await content.save();

    const sender = await User.findById((content as any).senderId).lean();
    const dto = await toDmContentDto(content, sender);

    const participantIds = (dm.participants as any[]).map((p) => String(p.userId));
    for (const pid of participantIds) {
      getIo().to(`dm:${pid}`).emit("receive-dm-message", { message: dto });
    }

    res.json({ reactions: (content as any).reactions ?? [] });
  } catch (error) {
    next(error);
  }
}

export async function createDirectMessage(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = createDirectMessageBodySchema.parse(req.body);

    const workspaceId = body.workspaceId && mongoose.isValidObjectId(body.workspaceId) ? body.workspaceId : null;

    // For 1:1 DM
    if (body.userId) {
      if (!mongoose.isValidObjectId(body.userId)) {
        throw new HttpError(400, "Invalid userId");
      }

      if (body.userId === req.userId) {
        throw new HttpError(400, "Cannot create DM with yourself");
      }

      const otherUser = await User.findById(body.userId);
      if (!otherUser) {
        throw new HttpError(404, "User not found");
      }

      // Check if DM already exists
      const existingQuery: any = {
        type: "direct",
        "participants.userId": { $all: [req.userId, body.userId] },
        $expr: { $eq: [{ $size: "$participants" }, 2] },
      };
      if (workspaceId) {
        // Allow reusing legacy DMs that were created without workspace scoping.
        existingQuery.workspaceId = { $in: [workspaceId, null] };
      } else {
        existingQuery.workspaceId = null;
      }

      const existing = await DirectMessage.findOne(existingQuery);

      if (existing) {
        // If user previously "deleted" (archived) this DM, unarchive it on re-open.
        // Otherwise it will not appear in GET /api/dms due to archivedBy filtering.
        const archivedBy = Array.isArray((existing as any).archivedBy) ? ((existing as any).archivedBy as any[]) : [];
        const isArchivedForMe = archivedBy.some((id) => String(id) === String(req.userId));
        if (isArchivedForMe) {
          await DirectMessage.updateOne(
            { _id: (existing as any)._id },
            {
              $pull: { archivedBy: req.userId },
              $set: { lastMessageAt: new Date() },
            },
          );
        }

        const userIds = [req.userId, body.userId];
        const users = await User.find({ _id: { $in: userIds } }).lean();
        const userMap = new Map(users.map((u) => [String((u as any)._id), u]));

        res.json({
          dm: {
            _id: String(existing._id),
            type: existing.type,
            participants: (existing.participants as any[]).map((p) => ({
              userId: String(p.userId),
              joinedAt: p.joinedAt,
              lastReadAt: p.lastReadAt,
            })),
            createdBy: String(existing.createdBy),
            workspaceId: existing.workspaceId ? String(existing.workspaceId) : null,
            lastMessageAt: existing.lastMessageAt,
            createdAt: existing.createdAt,
            updatedAt: existing.updatedAt,
          },
        });
        return;
      }

      const dmDoc = await DirectMessage.create({
        type: "direct",
        participants: [
          { userId: req.userId, joinedAt: new Date(), lastReadAt: new Date() },
          { userId: body.userId, joinedAt: new Date(), lastReadAt: new Date() },
        ],
        createdBy: req.userId,
        workspaceId,
        lastMessageAt: new Date(),
      });

      await ensureStreamChannelForDirectMessage({
        dmId: String(dmDoc._id),
        workspaceId: dmDoc.workspaceId ? String(dmDoc.workspaceId) : null,
        type: "direct",
        participantIds: [req.userId, body.userId],
        createdById: req.userId,
      });

      res.status(201).json({ dm: dmDoc.toJSON() });
      return;
    }

    // For group DM
    if (body.userIds && body.userIds.length > 0) {
      const userIds = [...new Set([req.userId, ...body.userIds])];
      if (userIds.length < 2) {
        throw new HttpError(400, "Group DM requires at least 2 participants");
      }

      // Validate all user IDs
      for (const uid of userIds) {
        if (!mongoose.isValidObjectId(uid)) {
          throw new HttpError(400, `Invalid userId: ${uid}`);
        }
      }

      const users = await User.find({ _id: { $in: userIds } });
      if (users.length !== userIds.length) {
        throw new HttpError(400, "One or more users not found");
      }

      const dmDoc = await DirectMessage.create({
        type: "group",
        participants: userIds.map((uid) => ({ userId: uid, joinedAt: new Date(), lastReadAt: new Date() })),
        name: body.name?.trim() || "",
        createdBy: req.userId,
        workspaceId,
        lastMessageAt: new Date(),
      });

      await ensureStreamChannelForDirectMessage({
        dmId: String(dmDoc._id),
        workspaceId: dmDoc.workspaceId ? String(dmDoc.workspaceId) : null,
        type: "group",
        name: String(dmDoc.name ?? ""),
        participantIds: userIds.map((id) => String(id)),
        createdById: req.userId,
      });

      res.status(201).json({ dm: dmDoc.toJSON() });
      return;
    }

    throw new HttpError(400, "Either userId (for 1:1) or userIds (for group) is required");
  } catch (error) {
    next(error);
  }
}

export async function listDirectMessages(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const workspaceIdRaw = String(req.query.workspaceId ?? "").trim();
    const workspaceId = workspaceIdRaw && mongoose.isValidObjectId(workspaceIdRaw) ? workspaceIdRaw : null;

    const query: any = {
      "participants.userId": req.userId,
      archivedBy: { $ne: req.userId },
    };

    if (workspaceId) {
      // Include legacy DMs that were created without workspace scoping.
      // This prevents "No DMs yet" for users who already have existing DMs.
      query.workspaceId = { $in: [workspaceId, null] };
    }

    const dms = await DirectMessage.find(query).sort({ lastMessageAt: -1 }).limit(100).lean();

    // Get participant user IDs
    const allParticipantIds = new Set<string>();
    for (const dm of dms) {
      for (const p of (dm.participants as any[]) || []) {
        allParticipantIds.add(String(p.userId));
      }
    }

    const users = await User.find({ _id: { $in: Array.from(allParticipantIds) } }).lean();
    const userMap = new Map(users.map((u) => [String((u as any)._id), u]));

    // Prevent OkHttp/clients from caching the DM list (304) which can cause "No DMs yet"
    // even after a DM is created.
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.json({
      dms: dms.map((dm) => ({
        _id: String(dm._id),
        type: dm.type,
        participants: (dm.participants as any[]).map((p) => ({
          userId: String(p.userId),
          role: String((p as any).role ?? "member"),
          user: userMap.get(String(p.userId))
            ? {
                _id: String((userMap.get(String(p.userId)) as any)._id),
                name: String((userMap.get(String(p.userId)) as any).name ?? ""),
                avatarUrl: String((userMap.get(String(p.userId)) as any).avatarUrl ?? ""),
                status: (userMap.get(String(p.userId)) as any).status ?? "offline",
              }
            : null,
          joinedAt: p.joinedAt,
          lastReadAt: p.lastReadAt,
        })),
        name: dm.name || "",
        createdBy: String(dm.createdBy),
        workspaceId: dm.workspaceId ? String(dm.workspaceId) : null,
        lastMessageAt: dm.lastMessageAt,
        createdAt: dm.createdAt,
        updatedAt: dm.updatedAt,
      })),
    });
  } catch (error) {
    next(error);
  }
}

export async function createDirectMessageContent(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = createDirectMessageContentBodySchema.parse(req.body);

    if (!mongoose.isValidObjectId(body.dmId)) {
      throw new HttpError(400, "Invalid dmId");
    }

    const dm = await ensureDMParticipant({ userId: req.userId, dmId: body.dmId });

    const trimmed = (body.text ?? "").trim();
    if (!trimmed && body.attachments.length === 0 && !body.poll) {
      throw new HttpError(400, "Message cannot be empty");
    }

    const threadRootIdRaw = String(body.threadRootId ?? "").trim();
    let threadRootId: string | null = null;
    if (threadRootIdRaw) {
      if (!mongoose.isValidObjectId(threadRootIdRaw)) {
        throw new HttpError(400, "Invalid threadRootId");
      }

      const root = await DirectMessageContent.findById(threadRootIdRaw).select({
        _id: 1,
        dmId: 1,
        threadRootId: 1,
        deletedAt: 1,
      });
      if (!root) {
        throw new HttpError(404, "Thread root message not found");
      }

      if (String(root.dmId) !== String(dm._id)) {
        throw new HttpError(400, "Thread root message is not in this DM");
      }

      if (root.threadRootId) {
        throw new HttpError(400, "threadRootId must reference a root message");
      }

      if (root.deletedAt) {
        throw new HttpError(400, "Thread root message deleted");
      }

      threadRootId = threadRootIdRaw;
    }

    // Parse mentions
    const { userIds: mentionIds } = dm.workspaceId
      ? await parseMentions(trimmed, String(dm.workspaceId))
      : { userIds: [] };

    const pollInput = body.poll
      ? {
          question: body.poll.question.trim(),
          options: body.poll.options.map((t) => ({ text: t.trim(), votes: [] as any[] })),
        }
      : null;

    const content = await DirectMessageContent.create({
      dmId: dm._id,
      senderId: req.userId,
      text: trimmed,
      attachments: body.attachments,
      reactions: [],
      readBy: [{ userId: req.userId }],
      poll: pollInput,
      editedAt: null,
      deletedAt: null,
      threadRootId,
      mentions: mentionIds,
    });

    // Update DM last message time
    dm.lastMessageAt = new Date();
    await dm.save();

    const sender = await User.findById(req.userId).lean();

    const dto = await toDmContentDto(content, sender);

    // Emit to all participants
    const participantIds = (dm.participants as any[]).map((p) => String(p.userId));
    for (const pid of participantIds) {
      getIo().to(`dm:${pid}`).emit("receive-dm-message", { message: dto });
    }

    res.status(201).json({ id: String(content._id), message: dto });
  } catch (error) {
    next(error);
  }
}

export async function voteDirectMessagePoll(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const messageId = String(req.params.messageId);
    const body = votePollBodySchema.parse(req.body);

    const { dm, content } = await ensureDmContentForParticipant({ userId: req.userId, messageId });

    const poll = (content as any).poll;
    if (!poll) throw new HttpError(400, "Message has no poll");
    const options = Array.isArray(poll.options) ? (poll.options as any[]) : [];
    if (options.length < 2) throw new HttpError(400, "Invalid poll");
    if (body.optionIndex < 0 || body.optionIndex >= options.length) throw new HttpError(400, "Invalid optionIndex");

    for (const opt of options) {
      const votes = Array.isArray(opt.votes) ? (opt.votes as any[]) : [];
      opt.votes = votes.filter((v) => String(v) !== req.userId);
    }
    const chosen = options[body.optionIndex];
    const chosenVotes = Array.isArray(chosen.votes) ? (chosen.votes as any[]) : [];
    if (!chosenVotes.some((v) => String(v) === req.userId)) {
      chosenVotes.push(req.userId as any);
    }
    chosen.votes = chosenVotes;

    (content as any).poll.options = options;
    await content.save();

    const sender = await User.findById((content as any).senderId).lean();
    const dto = await toDmContentDto(content, sender);
    const participantIds = (dm.participants as any[]).map((p) => String(p.userId));
    for (const pid of participantIds) {
      getIo().to(`dm:${pid}`).emit("receive-dm-message", { message: dto });
    }

    res.json({ message: dto });
  } catch (error) {
    next(error);
  }
}

export async function listDirectMessageContent(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const dmId = String(req.params.dmId);
    const limitRaw = Number(req.query.limit);
    const offsetRaw = Number(req.query.offset);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 100) : 50;
    const offset = Number.isFinite(offsetRaw) ? Math.max(Math.floor(offsetRaw), 0) : 0;

    if (!mongoose.isValidObjectId(dmId)) {
      throw new HttpError(400, "Invalid dmId");
    }

    await ensureDMParticipant({ userId: req.userId, dmId });

    const [messages, total] = await Promise.all([
      DirectMessageContent.find({ dmId, threadRootId: null })
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit),
      DirectMessageContent.countDocuments({ dmId, threadRootId: null }),
    ]);

    const rootIds = messages.map((m) => (m as any)._id).filter(Boolean);
    const replyCounts =
      rootIds.length > 0
        ? await DirectMessageContent.aggregate([
            { $match: { dmId: new mongoose.Types.ObjectId(dmId), threadRootId: { $in: rootIds } } },
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
        const sender = userMap.get(String((m as any).senderId)) ?? null;
        return {
          _id: String(m._id),
          dmId: String(m.dmId),
          sender: sender
            ? {
                _id: String(sender._id),
                name: String(sender.name ?? ""),
                avatarUrl: String(sender.avatarUrl ?? ""),
              }
            : { _id: String((m as any).senderId), name: "", avatarUrl: "" },
          text: m.deletedAt ? "" : String(m.text ?? ""),
          attachments: m.deletedAt ? [] : (m.attachments ?? []),
          reactions: m.reactions ?? [],
          readBy: (m.readBy as any[]).map((r) => ({ userId: String(r.userId), readAt: r.readAt })),
          editedAt: m.editedAt,
          deletedAt: m.deletedAt,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
          threadRootId: m.threadRootId ? String(m.threadRootId) : null,
          replyCount: replyCountByRootId.get(String((m as any)._id)) ?? 0,
          mentions: (m.mentions as any[]).map((id) => String(id)),
        };
      }),
      total,
    });
  } catch (error) {
    next(error);
  }
}

export async function getDirectMessageThread(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const threadRootIdParam = String(req.params.threadRootId);
    const limitRaw = Number(req.query.limit);
    const offsetRaw = Number(req.query.offset);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 100) : 50;
    const offset = Number.isFinite(offsetRaw) ? Math.max(Math.floor(offsetRaw), 0) : 0;

    if (!mongoose.isValidObjectId(threadRootIdParam)) {
      throw new HttpError(400, "Invalid threadRootId");
    }

    const candidate = await DirectMessageContent.findById(threadRootIdParam);
    if (!candidate) {
      throw new HttpError(404, "Thread not found");
    }

    const dm = await ensureDMParticipant({ userId: req.userId, dmId: String((candidate as any).dmId) });

    const rootId = (candidate as any).threadRootId
      ? String((candidate as any).threadRootId)
      : String((candidate as any)._id);
    const root = rootId === String((candidate as any)._id) ? candidate : await DirectMessageContent.findById(rootId);
    if (!root) {
      throw new HttpError(404, "Thread not found");
    }
    if ((root as any).threadRootId) {
      throw new HttpError(400, "Thread root message is invalid");
    }
    if (String((root as any).dmId) !== String(dm._id)) {
      throw new HttpError(400, "Thread root message is not in this DM");
    }

    const [replies, total] = await Promise.all([
      DirectMessageContent.find({ dmId: (root as any).dmId, threadRootId: (root as any)._id })
        .sort({ createdAt: 1 })
        .skip(offset)
        .limit(limit),
      DirectMessageContent.countDocuments({ dmId: (root as any).dmId, threadRootId: (root as any)._id }),
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

    const rootSender = userMap.get(String((root as any).senderId)) ?? null;
    const rootDto = await toDmContentDto(root, rootSender);

    const replyDtos = await Promise.all(
      replies.map(async (m) => {
        const sender = userMap.get(String((m as any).senderId)) ?? null;
        return toDmContentDto(m, sender);
      }),
    );

    res.json({ root: rootDto, replies: replyDtos, total });
  } catch (error) {
    next(error);
  }
}

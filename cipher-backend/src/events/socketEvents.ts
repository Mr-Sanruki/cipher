import type { Server as SocketIOServer, Socket } from "socket.io";
import mongoose from "mongoose";
import { Channel } from "../models/Channel";
import { DirectMessage } from "../models/DirectMessage";
import { Message } from "../models/Message";
import { User } from "../models/User";
import { Workspace } from "../models/Workspace";
import { verifyAccessToken } from "../utils/jwt";
import { logger } from "../utils/logger";

type AuthedSocket = Socket & { data: { userId: string } };

const userSocketCounts = new Map<string, number>();

type CallType = "voice" | "video";
type CallSession = {
  callId: string;
  dmId: string;
  type: CallType;
  fromUserId: string;
  toUserId: string;
  createdAt: number;
};

const activeCalls = new Map<string, CallSession>();

function callRoomName(callId: string): string {
  return `call:${callId}`;
}

async function ensureDmParticipant(input: { userId: string; dmId: string }): Promise<void> {
  if (!mongoose.isValidObjectId(input.dmId)) {
    throw new Error("Invalid dmId");
  }
  const dm = await DirectMessage.findById(input.dmId).select({ participants: 1 }).lean();
  if (!dm) {
    throw new Error("Direct message not found");
  }
  const isParticipant = Array.isArray((dm as any).participants) && ((dm as any).participants as any[]).some((p) => String(p.userId) === input.userId);
  if (!isParticipant) {
    throw new Error("Forbidden");
  }
}

export function registerSocketEvents(io: SocketIOServer): void {
  io.use((socket, next) => {
    try {
      const token = extractToken(socket);
      if (!token) {
        next(new Error("unauthorized"));
        return;
      }

      const payload = verifyAccessToken(token);
      (socket as AuthedSocket).data.userId = payload.sub;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const s = socket as AuthedSocket;
    const userId = s.data.userId;

    s.join(`dm:${userId}`);

    const currentCount = (userSocketCounts.get(userId) ?? 0) + 1;
    userSocketCounts.set(userId, currentCount);

    if (currentCount === 1) {
      void setUserStatus(io, { userId, status: "online" });
    }

    logger.info("Socket connected", { socketId: s.id, userId });

    s.on("join-workspace", async (payload, ack) => {
      try {
        const workspaceId = String(payload?.workspaceId ?? "");
        await ensureWorkspaceMember({ userId, workspaceId });

        const roomName = `workspace:${workspaceId}`;
        s.join(roomName);
        ack?.({ ok: true });
      } catch (error) {
        ack?.({ ok: false, message: errorMessage(error) });
      }
    });

    s.on("call-start", async (payload, ack) => {
      try {
        const callId = String(payload?.callId ?? "").trim();
        const dmId = String(payload?.dmId ?? "").trim();
        const type = (payload?.type === "video" ? "video" : "voice") as CallType;
        const toUserId = String(payload?.toUserId ?? "").trim();

        if (!callId) throw new Error("callId is required");
        if (!mongoose.isValidObjectId(dmId)) throw new Error("Invalid dmId");
        if (!mongoose.isValidObjectId(toUserId)) throw new Error("Invalid toUserId");

        await ensureDmParticipant({ userId, dmId });
        await ensureDmParticipant({ userId: toUserId, dmId });

        const session: CallSession = { callId, dmId, type, fromUserId: userId, toUserId, createdAt: Date.now() };
        activeCalls.set(callId, session);

        s.join(callRoomName(callId));

        io.to(`dm:${toUserId}`).emit("call-incoming", { callId, dmId, type, fromUserId: userId, toUserId });
        io.to(`dm:${userId}`).emit("call-incoming", { callId, dmId, type, fromUserId: userId, toUserId });

        ack?.({ ok: true });
      } catch (error) {
        ack?.({ ok: false, message: errorMessage(error) });
      }
    });

    s.on("call-accept", async (payload, ack) => {
      try {
        const callId = String(payload?.callId ?? "").trim();
        if (!callId) throw new Error("callId is required");

        const session = activeCalls.get(callId);
        if (!session) throw new Error("Call not found");
        if (userId !== session.toUserId && userId !== session.fromUserId) throw new Error("Forbidden");

        s.join(callRoomName(callId));

        io.to(`dm:${session.fromUserId}`).emit("call-accepted", { callId });
        io.to(`dm:${session.toUserId}`).emit("call-accepted", { callId });
        ack?.({ ok: true });
      } catch (error) {
        ack?.({ ok: false, message: errorMessage(error) });
      }
    });

    s.on("call-reject", async (payload, ack) => {
      try {
        const callId = String(payload?.callId ?? "").trim();
        if (!callId) throw new Error("callId is required");
        const session = activeCalls.get(callId);
        if (!session) throw new Error("Call not found");
        if (userId !== session.toUserId && userId !== session.fromUserId) throw new Error("Forbidden");

        activeCalls.delete(callId);
        io.to(`dm:${session.fromUserId}`).emit("call-rejected", { callId });
        io.to(`dm:${session.toUserId}`).emit("call-rejected", { callId });
        io.to(callRoomName(callId)).emit("call-ended", { callId });
        ack?.({ ok: true });
      } catch (error) {
        ack?.({ ok: false, message: errorMessage(error) });
      }
    });

    s.on("call-end", async (payload, ack) => {
      try {
        const callId = String(payload?.callId ?? "").trim();
        if (!callId) throw new Error("callId is required");
        const session = activeCalls.get(callId);
        if (!session) throw new Error("Call not found");
        if (userId !== session.toUserId && userId !== session.fromUserId) throw new Error("Forbidden");

        activeCalls.delete(callId);
        io.to(`dm:${session.fromUserId}`).emit("call-ended", { callId });
        io.to(`dm:${session.toUserId}`).emit("call-ended", { callId });
        io.to(callRoomName(callId)).emit("call-ended", { callId });
        ack?.({ ok: true });
      } catch (error) {
        ack?.({ ok: false, message: errorMessage(error) });
      }
    });

    s.on("call-signal", async (payload, ack) => {
      try {
        const callId = String(payload?.callId ?? "").trim();
        const data = payload?.data;
        if (!callId) throw new Error("callId is required");
        if (!data) throw new Error("data is required");

        const session = activeCalls.get(callId);
        if (!session) throw new Error("Call not found");
        if (userId !== session.toUserId && userId !== session.fromUserId) throw new Error("Forbidden");

        if (!s.rooms.has(callRoomName(callId))) {
          s.join(callRoomName(callId));
        }

        s.to(callRoomName(callId)).emit("call-signal", { callId, fromUserId: userId, data });
        ack?.({ ok: true });
      } catch (error) {
        ack?.({ ok: false, message: errorMessage(error) });
      }
    });

    s.on("leave-workspace", async (payload, ack) => {
      try {
        const workspaceId = String(payload?.workspaceId ?? "");
        const roomName = `workspace:${workspaceId}`;
        s.leave(roomName);
        ack?.({ ok: true });
      } catch (error) {
        ack?.({ ok: false, message: errorMessage(error) });
      }
    });

    s.on("join-channel", async (payload, ack) => {
      try {
        const channelId = String(payload?.channelId ?? "");
        await ensureChannelMember({ userId, channelId });

        s.join(channelId);
        ack?.({ ok: true });
      } catch (error) {
        ack?.({ ok: false, message: errorMessage(error) });
      }
    });

    s.on("leave-channel", async (payload, ack) => {
      try {
        const channelId = String(payload?.channelId ?? "");
        s.leave(channelId);
        ack?.({ ok: true });
      } catch (error) {
        ack?.({ ok: false, message: errorMessage(error) });
      }
    });

    s.on("interview-join", async (payload, ack) => {
      try {
        const workspaceId = String(payload?.workspaceId ?? "");
        const roomId = String(payload?.roomId ?? "");

        const normalizedRoomId = normalizeInterviewRoomId(roomId);
        await ensureWorkspaceMember({ userId, workspaceId });

        const roomName = interviewRoomName(workspaceId, normalizedRoomId);
        const room = io.sockets.adapter.rooms.get(roomName);
        const size = room?.size ?? 0;

        if (size >= 2) {
          throw new Error("Room is full");
        }

        const isInitiator = size === 0;
        s.join(roomName);

        s.to(roomName).emit("interview-participant-joined", { workspaceId, roomId: normalizedRoomId, userId });
        ack?.({ ok: true, isInitiator });
      } catch (error) {
        ack?.({ ok: false, message: errorMessage(error) });
      }
    });

    s.on("interview-leave", async (payload, ack) => {
      try {
        const workspaceId = String(payload?.workspaceId ?? "");
        const roomId = String(payload?.roomId ?? "");
        const normalizedRoomId = normalizeInterviewRoomId(roomId);

        await ensureWorkspaceMember({ userId, workspaceId });

        const roomName = interviewRoomName(workspaceId, normalizedRoomId);
        s.leave(roomName);

        s.to(roomName).emit("interview-participant-left", { workspaceId, roomId: normalizedRoomId, userId });
        ack?.({ ok: true });
      } catch (error) {
        ack?.({ ok: false, message: errorMessage(error) });
      }
    });

    s.on("interview-signal", async (payload, ack) => {
      try {
        const workspaceId = String(payload?.workspaceId ?? "");
        const roomId = String(payload?.roomId ?? "");
        const normalizedRoomId = normalizeInterviewRoomId(roomId);
        const data = payload?.data;

        await ensureWorkspaceMember({ userId, workspaceId });

        const roomName = interviewRoomName(workspaceId, normalizedRoomId);
        if (!s.rooms.has(roomName)) {
          throw new Error("Not in room");
        }

        s.to(roomName).emit("interview-signal", { workspaceId, roomId: normalizedRoomId, fromUserId: userId, data });
        ack?.({ ok: true });
      } catch (error) {
        ack?.({ ok: false, message: errorMessage(error) });
      }
    });

    s.on("send-message", async (payload, ack) => {
      try {
        const channelId = String(payload?.channelId ?? "");
        const messageInput = payload?.message ?? payload ?? {};
        const text = String(messageInput?.text ?? "").trim();
        const attachments = Array.isArray(messageInput?.attachments) ? messageInput.attachments : [];
        const threadRootIdRaw = String(messageInput?.threadRootId ?? "").trim();

        await ensureChannelMember({ userId, channelId });

        const channelForPolicy = await Channel.findById(channelId).select({ workspaceId: 1, createdBy: 1, postingPolicy: 1 }).lean();
        const postingPolicy = String((channelForPolicy as any)?.postingPolicy ?? "everyone");
        if (postingPolicy === "admins_only") {
          const workspaceIdForPolicy = (channelForPolicy as any)?.workspaceId ? String((channelForPolicy as any).workspaceId) : "";
          if (!mongoose.isValidObjectId(workspaceIdForPolicy)) {
            throw new Error("Workspace not found");
          }
          const workspace = await Workspace.findById(workspaceIdForPolicy).select({ members: 1 }).lean();
          if (!workspace) {
            throw new Error("Workspace not found");
          }
          const wsMember = ((workspace as any).members as any[]).find((m) => String(m.userId) === userId);
          const wsRole = wsMember ? String(wsMember.role ?? "member") : "member";
          const isCreator = channelForPolicy && String((channelForPolicy as any).createdBy) === userId;
          if (wsRole !== "admin" && !isCreator) {
            throw new Error("Only admins can send messages in this channel");
          }
        }

        const channel = await Channel.findById(channelId).select({ workspaceId: 1 }).lean();
        const workspaceId = (channel as any)?.workspaceId ? String((channel as any).workspaceId) : "";

        if (!text && attachments.length === 0) {
          throw new Error("Message cannot be empty");
        }

        let threadRootId: any = null;
        if (threadRootIdRaw) {
          if (!mongoose.isValidObjectId(threadRootIdRaw)) {
            throw new Error("Invalid threadRootId");
          }
          const root = await Message.findById(threadRootIdRaw).select({ _id: 1, channelId: 1, threadRootId: 1, deletedAt: 1 });
          if (!root) throw new Error("Thread root message not found");
          if (String((root as any).channelId) !== channelId) throw new Error("Thread root message is not in this channel");
          if ((root as any).threadRootId) throw new Error("threadRootId must reference a root message");
          if ((root as any).deletedAt) throw new Error("Thread root message deleted");
          threadRootId = (root as any)._id;
        }

        const message = await Message.create({
          channelId,
          senderId: userId,
          text,
          attachments,
          reactions: [],
          readBy: [{ userId }],
          editedAt: null,
          deletedAt: null,
          threadRootId,
        });

        const sender = await User.findById(userId).lean();
        const dto = toMessageDto(message, sender);

        s.to(channelId).emit("receive-message", { message: dto });
        if (workspaceId) {
          io.to(`workspace:${workspaceId}`).emit("receive-message", { message: dto });
        }
        ack?.({ ok: true, message: dto });
      } catch (error) {
        ack?.({ ok: false, message: errorMessage(error) });
      }
    });

    s.on("edit-message", async (payload, ack) => {
      try {
        const messageId = String(payload?.messageId ?? "");
        const text = String(payload?.text ?? "").trim();

        if (!mongoose.isValidObjectId(messageId)) throw new Error("Invalid messageId");
        if (!text) throw new Error("Text is required");

        const message = await Message.findById(messageId);
        if (!message) throw new Error("Message not found");

        await ensureChannelMember({ userId, channelId: String(message.channelId) });

        if (String(message.senderId) !== userId) throw new Error("Forbidden");

        if (message.deletedAt) throw new Error("Message deleted");

        message.text = text;
        message.editedAt = new Date();
        await message.save();

        io.to(String(message.channelId)).emit("message-edited", { messageId, text: message.text });
        ack?.({ ok: true });
      } catch (error) {
        ack?.({ ok: false, message: errorMessage(error) });
      }
    });

    s.on("delete-message", async (payload, ack) => {
      try {
        const messageId = String(payload?.messageId ?? "");
        if (!mongoose.isValidObjectId(messageId)) throw new Error("Invalid messageId");

        const message = await Message.findById(messageId);
        if (!message) throw new Error("Message not found");

        await ensureChannelMember({ userId, channelId: String(message.channelId) });

        if (String(message.senderId) !== userId) throw new Error("Forbidden");

        const channelId = String(message.channelId);

        const isRoot = !(message as any).threadRootId;
        if (isRoot) {
          const replyIds = await Message.find({ channelId: message.channelId, threadRootId: message._id }).distinct("_id");
          await Promise.all([
            replyIds.length > 0 ? Message.deleteMany({ _id: { $in: replyIds } }) : Promise.resolve(),
            Message.deleteOne({ _id: message._id }),
          ]);

          for (const rid of replyIds) {
            io.to(channelId).emit("message-deleted", { messageId: String(rid) });
          }
          io.to(channelId).emit("message-deleted", { messageId: String(message._id) });
          ack?.({ ok: true });
          return;
        }

        await Message.deleteOne({ _id: message._id });
        io.to(channelId).emit("message-deleted", { messageId: String(message._id) });
        ack?.({ ok: true });
      } catch (error) {
        ack?.({ ok: false, message: errorMessage(error) });
      }
    });

    s.on("typing", async (payload) => {
      try {
        const channelId = String(payload?.channelId ?? "");
        await ensureChannelMember({ userId, channelId });
        s.to(channelId).emit("user-typing", { userId });
        s.to(channelId).emit("typing", { userId, channelId });
      } catch {
        return;
      }
    });

    s.on("disconnecting", () => {
      for (const roomName of s.rooms) {
        const parsed = parseInterviewRoomName(roomName);
        if (!parsed) continue;
        s.to(roomName).emit("interview-participant-left", { workspaceId: parsed.workspaceId, roomId: parsed.roomId, userId });
      }
    });

    s.on("stop-typing", async (payload) => {
      try {
        const channelId = String(payload?.channelId ?? "");
        await ensureChannelMember({ userId, channelId });
        s.to(channelId).emit("user-stopped-typing", { userId });
        s.to(channelId).emit("stop-typing", { userId, channelId });
      } catch {
        return;
      }
    });

    s.on("read-message", async (payload, ack) => {
      try {
        const messageId = String(payload?.messageId ?? "");
        if (!mongoose.isValidObjectId(messageId)) throw new Error("Invalid messageId");

        const message = await Message.findById(messageId);
        if (!message) throw new Error("Message not found");

        await ensureChannelMember({ userId, channelId: String(message.channelId) });

        const already = (message.readBy as any[]).some((r) => String(r.userId) === userId);
        if (!already) {
          (message.readBy as any[]).push({ userId, readAt: new Date() });
          await message.save();

          const reader = await User.findById(userId).lean();
          const readerDto = reader
            ? { _id: String((reader as any)._id), name: String((reader as any).name ?? ""), avatarUrl: String((reader as any).avatarUrl ?? "") }
            : { _id: userId, name: "", avatarUrl: "" };

          io.to(String(message.channelId)).emit("message-read", { messageId, user: readerDto });
        }
        ack?.({ ok: true });
      } catch (error) {
        ack?.({ ok: false, message: errorMessage(error) });
      }
    });

    s.on("react-message", async (payload, ack) => {
      try {
        const messageId = String(payload?.messageId ?? "");
        const emoji = String(payload?.emoji ?? "");
        if (!mongoose.isValidObjectId(messageId)) throw new Error("Invalid messageId");
        if (!emoji) throw new Error("emoji is required");

        const message = await Message.findById(messageId);
        if (!message) throw new Error("Message not found");

        await ensureChannelMember({ userId, channelId: String(message.channelId) });

        const reactions = message.reactions as any[];
        const existing = reactions.find((r) => r.emoji === emoji && String(r.userId) === userId);

        if (existing) {
          message.reactions = reactions.filter((r) => !(r.emoji === emoji && String(r.userId) === userId)) as any;
        } else {
          reactions.push({ emoji, userId });
        }

        await message.save();

        io.to(String(message.channelId)).emit("message-reaction", { messageId, emoji, userId });
        ack?.({ ok: true, reactions: message.reactions });
      } catch (error) {
        ack?.({ ok: false, message: errorMessage(error) });
      }
    });

    s.on("user-online", async (payload) => {
      try {
        const status = String(payload?.status ?? "online");
        if (!isValidStatus(status)) return;

        await User.updateOne({ _id: userId }, { $set: { status } });
        io.emit("user-status-changed", { userId, status });
      } catch {
        return;
      }
    });

    s.on("disconnect", (reason) => {
      logger.info("Socket disconnected", { socketId: s.id, userId, reason });

      const prevCount = userSocketCounts.get(userId) ?? 0;
      const nextCount = Math.max(prevCount - 1, 0);
      if (nextCount === 0) {
        userSocketCounts.delete(userId);
        void setUserStatus(io, { userId, status: "offline" });
      } else {
        userSocketCounts.set(userId, nextCount);
      }
    });
  });
}

async function setUserStatus(io: SocketIOServer, input: { userId: string; status: string }): Promise<void> {
  try {
    if (!isValidStatus(input.status)) return;
    await User.updateOne({ _id: input.userId }, { $set: { status: input.status } });
    io.emit("user-status-changed", { userId: input.userId, status: input.status });
    if (input.status === "online") {
      io.emit("user-online", { userId: input.userId, status: input.status });
    }
    if (input.status === "offline") {
      io.emit("user-offline", { userId: input.userId, status: input.status });
    }
  } catch {
    return;
  }
}

function extractToken(socket: Socket): string | null {
  const tokenFromAuth = (socket.handshake.auth as any)?.token;
  if (typeof tokenFromAuth === "string" && tokenFromAuth.trim()) return tokenFromAuth.trim();

  const header = socket.handshake.headers?.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length).trim();
    if (token) return token;
  }

  return null;
}

async function ensureChannelMember(input: { userId: string; channelId: string }): Promise<void> {
  if (!mongoose.isValidObjectId(input.channelId)) {
    throw new Error("Invalid channelId");
  }

  const channel = await Channel.findById(input.channelId).lean();
  if (!channel) {
    throw new Error("Channel not found");
  }

  const members = (channel as any).members as any[];
  const isMember = Array.isArray(members) && members.some((m) => String(m.userId) === input.userId);

  if ((channel as any).isPrivate === true) {
    if (!isMember) {
      throw new Error("Forbidden");
    }
    return;
  }

  const workspaceId = String((channel as any).workspaceId);
  if (!mongoose.isValidObjectId(workspaceId)) {
    throw new Error("Workspace not found");
  }

  const workspace = await Workspace.findById(workspaceId).select({ members: 1 }).lean();
  if (!workspace) {
    throw new Error("Workspace not found");
  }

  const wsMembers = (workspace as any).members as any[];
  const isWorkspaceMember = Array.isArray(wsMembers) && wsMembers.some((m) => String(m.userId) === input.userId);
  if (!isWorkspaceMember) {
    throw new Error("Forbidden");
  }

  if (!isMember) {
    await Channel.updateOne(
      { _id: input.channelId },
      {
        $addToSet: { members: { userId: input.userId } },
      }
    );
  }
}

function interviewRoomName(workspaceId: string, roomId: string): string {
  return `interview:${workspaceId}:${roomId}`;
}

function parseInterviewRoomName(roomName: string): { workspaceId: string; roomId: string } | null {
  if (!roomName.startsWith("interview:")) return null;
  const parts = roomName.split(":");
  if (parts.length !== 3) return null;
  const workspaceId = parts[1] ?? "";
  const roomId = parts[2] ?? "";
  if (!mongoose.isValidObjectId(workspaceId)) return null;
  if (!roomId) return null;
  return { workspaceId, roomId };
}

function normalizeInterviewRoomId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("roomId is required");
  if (trimmed.length > 40) throw new Error("roomId too long");
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    throw new Error("Invalid roomId");
  }
  return trimmed;
}

async function ensureWorkspaceMember(input: { userId: string; workspaceId: string }): Promise<void> {
  if (!mongoose.isValidObjectId(input.workspaceId)) {
    throw new Error("Invalid workspaceId");
  }

  const workspace = await Workspace.findById(input.workspaceId).select({ members: 1 }).lean();
  if (!workspace) {
    throw new Error("Workspace not found");
  }

  const members = (workspace as any).members as any[];
  const isMember = Array.isArray(members) && members.some((m) => String(m.userId) === input.userId);
  if (!isMember) {
    throw new Error("Forbidden");
  }
}

function toMessageDto(message: any, sender: any | null) {
  const senderDto = sender
    ? { _id: String(sender._id), name: String(sender.name ?? ""), avatarUrl: String(sender.avatarUrl ?? "") }
    : { _id: String(message.senderId), name: "", avatarUrl: "" };

  const readBy = Array.isArray(message.readBy) ? (message.readBy as any[]) : [];
  const readByUsers = readBy.map((r) => {
    const id = String((r as any)?.userId ?? "");
    if (sender && String(sender._id) === id) {
      return senderDto;
    }
    return { _id: id, name: "", avatarUrl: "" };
  });

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
  };
}

function isValidStatus(value: string): boolean {
  return value === "online" || value === "offline" || value === "away";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Request failed";
}

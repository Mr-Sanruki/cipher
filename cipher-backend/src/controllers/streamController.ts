import jwt, { type SignOptions } from "jsonwebtoken";
import type { Response, NextFunction } from "express";
import { z } from "zod";
import { StreamChat } from "stream-chat";
import { env } from "../config/env";
import type { AuthenticatedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import mongoose from "mongoose";
import { Channel } from "../models/Channel";
import { DirectMessage } from "../models/DirectMessage";
import { Workspace } from "../models/Workspace";
import { ensureStreamChannelForDirectMessage, ensureStreamChannelForWorkspaceChannel } from "../services/streamChatService";

const STREAM_TOKEN_DEFAULT_VALIDITY_SECONDS = 60 * 60;

const callCidSchema = z.string().trim().min(1);

export const createVideoCallTokenBodySchema = z.object({
  callCids: z.array(callCidSchema).min(1).max(50),
  role: z.string().trim().min(1).optional(),
  validitySeconds: z.coerce.number().int().positive().max(7 * 24 * 60 * 60).optional(),
});

type CreateVideoCallTokenBody = z.infer<typeof createVideoCallTokenBodySchema>;

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

function signStreamToken(
  apiSecret: string,
  payload: Record<string, unknown>,
  validitySeconds?: number
): string {
  const options: SignOptions = { algorithm: "HS256" };
  const validity = typeof validitySeconds === "number" ? validitySeconds : STREAM_TOKEN_DEFAULT_VALIDITY_SECONDS;

  options.expiresIn = validity;

  return jwt.sign(payload, apiSecret, options);
}

export async function getVideoUserToken(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { apiKey, apiSecret } = requireStreamConfig();

    const token = signStreamToken(apiSecret, {
      user_id: req.userId,
    });

    res.json({ apiKey, token, userId: req.userId });
  } catch (error) {
    next(error);
  }
}

export async function backfillChatChannels(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.userId;

    const workspaces = await Workspace.find({ "members.userId": userId }).select({ members: 1 }).lean();
    const workspaceIds = workspaces.map((w) => String((w as any)._id));
    const workspaceObjectIds = workspaceIds
      .filter((id) => mongoose.isValidObjectId(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    const workspaceMemberIds = new Map<string, string[]>();
    for (const w of workspaces) {
      const id = String((w as any)._id);
      const members = Array.isArray((w as any).members) ? (w as any).members : [];
      workspaceMemberIds.set(
        id,
        members.map((m: any) => String(m.userId)).filter(Boolean)
      );
    }

    const channels = await Channel.find({ workspaceId: { $in: workspaceObjectIds } }).lean();
    const dms = await DirectMessage.find({ "participants.userId": userId }).lean();

    let channelsSynced = 0;
    let dmsSynced = 0;

    const syncErrors: Array<{ kind: "channel" | "dm"; id: string; message: string }> = [];

    for (const c of channels) {
      const wsId = String((c as any).workspaceId);
      const memberIds = (c as any).isPrivate
        ? Array.isArray((c as any).members)
          ? (c as any).members.map((m: any) => String(m.userId)).filter(Boolean)
          : [userId]
        : (workspaceMemberIds.get(wsId) ?? [userId]);

      try {
        await ensureStreamChannelForWorkspaceChannel({
          workspaceId: wsId,
          channelId: String((c as any)._id),
          name: String((c as any).name ?? ""),
          isPrivate: Boolean((c as any).isPrivate),
          memberIds,
          createdById: String((c as any).createdBy ?? userId),
        });
        channelsSynced += 1;
      } catch (e: any) {
        syncErrors.push({
          kind: "channel",
          id: String((c as any)._id),
          message: typeof e?.message === "string" ? e.message : "Failed to sync channel",
        });
      }
    }

    for (const dm of dms) {
      const participantIds = Array.isArray((dm as any).participants)
        ? (dm as any).participants.map((p: any) => String(p.userId)).filter(Boolean)
        : [userId];

      try {
        await ensureStreamChannelForDirectMessage({
          dmId: String((dm as any)._id),
          workspaceId: (dm as any).workspaceId ? String((dm as any).workspaceId) : null,
          type: (dm as any).type === "group" ? "group" : "direct",
          name: String((dm as any).name ?? ""),
          participantIds,
          createdById: String((dm as any).createdBy ?? userId),
        });
        dmsSynced += 1;
      } catch (e: any) {
        syncErrors.push({
          kind: "dm",
          id: String((dm as any)._id),
          message: typeof e?.message === "string" ? e.message : "Failed to sync DM",
        });
      }
    }

    res.json({ ok: syncErrors.length === 0, workspaces: workspaceIds.length, channels: channelsSynced, dms: dmsSynced, syncErrors });
  } catch (error) {
    next(error);
  }
}

export async function createVideoCallToken(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const body: CreateVideoCallTokenBody = createVideoCallTokenBodySchema.parse(req.body);

    const { apiKey, apiSecret } = requireStreamConfig();

    const payload: Record<string, unknown> = {
      user_id: req.userId,
      call_cids: body.callCids,
    };

    if (body.role) {
      payload.role = body.role;
    }

    const token = signStreamToken(apiSecret, payload, body.validitySeconds);

    res.json({ apiKey, token });
  } catch (error) {
    next(error);
  }
}

export async function getChatUserToken(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { apiKey, apiSecret } = requireStreamConfig();

    const client = StreamChat.getInstance(apiKey, apiSecret);
    const token = client.createToken(req.userId);

    res.json({ apiKey, token, userId: req.userId });
  } catch (error) {
    next(error);
  }
}

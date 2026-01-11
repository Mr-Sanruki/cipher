import type { Response, NextFunction } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import type { AuthenticatedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { requireWorkspaceMember } from "../utils/access";
import { FocusSession } from "../models/FocusSession";

export const createFocusSessionBodySchema = z.object({
  workspaceId: z.string().min(1),
  taskId: z.string().optional().nullable().default(null),
  startedAt: z.string().datetime().optional().default(() => new Date().toISOString()),
  endedAt: z.string().datetime().optional().nullable().default(null),
  mode: z.enum(["focus", "break"]).optional().default("focus"),
  durationSeconds: z.coerce.number().int().nonnegative().optional().default(0),
});

export const updateFocusSessionBodySchema = z.object({
  endedAt: z.string().datetime().optional().nullable(),
  durationSeconds: z.coerce.number().int().nonnegative().optional(),
  mode: z.enum(["focus", "break"]).optional(),
  taskId: z.string().optional().nullable(),
});

export async function listFocusSessions(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const workspaceId = String(req.query.workspaceId ?? "");
    if (!mongoose.isValidObjectId(workspaceId)) throw new HttpError(400, "workspaceId is required");

    await requireWorkspaceMember({ userId: req.userId, workspaceId });

    const sessions = await FocusSession.find({ workspaceId, userId: req.userId, deletedAt: null }).sort({ startedAt: -1 }).limit(500);

    res.json({ focusSessions: sessions.map((s) => s.toJSON()) });
  } catch (error) {
    next(error);
  }
}

export async function createFocusSession(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = createFocusSessionBodySchema.parse(req.body);

    await requireWorkspaceMember({ userId: req.userId, workspaceId: body.workspaceId });

    const taskId = body.taskId && mongoose.isValidObjectId(body.taskId) ? body.taskId : null;
    const startedAt = new Date(body.startedAt);
    const endedAt = body.endedAt ? new Date(body.endedAt) : null;

    const session = await FocusSession.create({
      workspaceId: body.workspaceId,
      userId: req.userId,
      taskId,
      startedAt,
      endedAt,
      mode: body.mode,
      durationSeconds: body.durationSeconds,
    });

    res.status(201).json({ focusSession: session.toJSON() });
  } catch (error) {
    next(error);
  }
}

export async function updateFocusSession(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = updateFocusSessionBodySchema.parse(req.body);
    const sessionId = String(req.params.sessionId ?? "");
    if (!mongoose.isValidObjectId(sessionId)) throw new HttpError(400, "Invalid sessionId");

    const session = await FocusSession.findById(sessionId);
    if (!session || (session as any).deletedAt) throw new HttpError(404, "Focus session not found");

    await requireWorkspaceMember({ userId: req.userId, workspaceId: String((session as any).workspaceId) });

    if (String((session as any).userId) !== req.userId) throw new HttpError(403, "Not allowed");

    if (body.endedAt !== undefined) (session as any).endedAt = body.endedAt ? new Date(body.endedAt) : null;
    if (body.durationSeconds !== undefined) (session as any).durationSeconds = body.durationSeconds;
    if (body.mode !== undefined) (session as any).mode = body.mode;
    if (body.taskId !== undefined) {
      (session as any).taskId = body.taskId && mongoose.isValidObjectId(body.taskId) ? body.taskId : null;
    }

    await session.save();

    res.json({ focusSession: session.toJSON() });
  } catch (error) {
    next(error);
  }
}

export async function deleteFocusSession(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const sessionId = String(req.params.sessionId ?? "");
    if (!mongoose.isValidObjectId(sessionId)) throw new HttpError(400, "Invalid sessionId");

    const session = await FocusSession.findById(sessionId);
    if (!session || (session as any).deletedAt) throw new HttpError(404, "Focus session not found");

    await requireWorkspaceMember({ userId: req.userId, workspaceId: String((session as any).workspaceId) });

    if (String((session as any).userId) !== req.userId) throw new HttpError(403, "Not allowed");

    (session as any).deletedAt = new Date();
    await session.save();

    res.json({ message: "Focus session deleted" });
  } catch (error) {
    next(error);
  }
}

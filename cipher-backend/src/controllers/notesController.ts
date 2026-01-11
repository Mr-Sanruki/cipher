import type { Response, NextFunction } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import type { AuthenticatedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { requireWorkspaceMember } from "../utils/access";
import { Note } from "../models/Note";

export const createNoteBodySchema = z.object({
  workspaceId: z.string().min(1),
  title: z.string().max(200).optional().default(""),
  content: z.string().max(40000).optional().default(""),
  tags: z.array(z.string().max(50)).optional().default([]),
});

export const updateNoteBodySchema = z.object({
  title: z.string().max(200).optional(),
  content: z.string().max(40000).optional(),
  tags: z.array(z.string().max(50)).optional(),
});

export async function listNotes(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const workspaceId = String(req.query.workspaceId ?? "");
    if (!mongoose.isValidObjectId(workspaceId)) throw new HttpError(400, "workspaceId is required");

    await requireWorkspaceMember({ userId: req.userId, workspaceId });

    const q = String(req.query.q ?? "").trim().toLowerCase();

    const notes = await Note.find({ workspaceId, deletedAt: null }).sort({ updatedAt: -1 }).limit(500);

    const filtered = q
      ? notes.filter((n) => {
          const t = String((n as any).title ?? "").toLowerCase();
          const c = String((n as any).content ?? "").toLowerCase();
          const tags = Array.isArray((n as any).tags) ? ((n as any).tags as any[]).map((x) => String(x).toLowerCase()) : [];
          return t.includes(q) || c.includes(q) || tags.some((x) => x.includes(q));
        })
      : notes;

    res.json({ notes: filtered.map((n) => n.toJSON()) });
  } catch (error) {
    next(error);
  }
}

export async function createNote(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = createNoteBodySchema.parse(req.body);

    await requireWorkspaceMember({ userId: req.userId, workspaceId: body.workspaceId });

    const note = await Note.create({
      workspaceId: body.workspaceId,
      createdBy: req.userId,
      title: body.title ?? "",
      content: body.content ?? "",
      tags: body.tags ?? [],
    });

    res.status(201).json({ note: note.toJSON() });
  } catch (error) {
    next(error);
  }
}

export async function updateNote(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const noteId = String(req.params.noteId ?? "");
    if (!mongoose.isValidObjectId(noteId)) throw new HttpError(400, "Invalid noteId");

    const body = updateNoteBodySchema.parse(req.body);

    const note = await Note.findById(noteId);
    if (!note || (note as any).deletedAt) throw new HttpError(404, "Note not found");

    await requireWorkspaceMember({ userId: req.userId, workspaceId: String((note as any).workspaceId) });

    if (body.title !== undefined) (note as any).title = body.title;
    if (body.content !== undefined) (note as any).content = body.content;
    if (body.tags !== undefined) (note as any).tags = body.tags;

    await note.save();

    res.json({ note: note.toJSON() });
  } catch (error) {
    next(error);
  }
}

export async function deleteNote(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const noteId = String(req.params.noteId ?? "");
    if (!mongoose.isValidObjectId(noteId)) throw new HttpError(400, "Invalid noteId");

    const note = await Note.findById(noteId);
    if (!note || (note as any).deletedAt) throw new HttpError(404, "Note not found");

    await requireWorkspaceMember({ userId: req.userId, workspaceId: String((note as any).workspaceId) });

    (note as any).deletedAt = new Date();
    await note.save();

    res.json({ message: "Note deleted" });
  } catch (error) {
    next(error);
  }
}

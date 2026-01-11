import type { Response, NextFunction } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import type { AuthenticatedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { requireWorkspaceMember } from "../utils/access";
import { Task } from "../models/Task";

export const createTaskBodySchema = z.object({
  workspaceId: z.string().min(1),
  title: z.string().min(1).max(200),
  note: z.string().max(2000).optional().default(""),
  priority: z.enum(["low", "medium", "high"]).optional().default("medium"),
  status: z.enum(["todo", "doing", "done"]).optional().default("todo"),
  dueAt: z.string().datetime().optional().nullable().default(null),
  order: z.coerce.number().int().optional().default(0),
});

export const updateTaskBodySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  note: z.string().max(2000).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  status: z.enum(["todo", "doing", "done"]).optional(),
  dueAt: z.string().datetime().optional().nullable(),
  order: z.coerce.number().int().optional(),
});

export async function listTasks(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const workspaceId = String(req.query.workspaceId ?? "");
    if (!mongoose.isValidObjectId(workspaceId)) throw new HttpError(400, "workspaceId is required");

    await requireWorkspaceMember({ userId: req.userId, workspaceId });

    const tasks = await Task.find({ workspaceId, deletedAt: null }).sort({ order: 1, createdAt: -1 });

    res.json({ tasks: tasks.map((t) => t.toJSON()) });
  } catch (error) {
    next(error);
  }
}

export async function createTask(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = createTaskBodySchema.parse(req.body);

    await requireWorkspaceMember({ userId: req.userId, workspaceId: body.workspaceId });

    const dueAt = body.dueAt ? new Date(body.dueAt) : null;

    const task = await Task.create({
      workspaceId: body.workspaceId,
      createdBy: req.userId,
      title: body.title,
      note: body.note ?? "",
      priority: body.priority,
      status: body.status,
      dueAt,
      order: body.order,
      completedAt: body.status === "done" ? new Date() : null,
    });

    res.status(201).json({ task: task.toJSON() });
  } catch (error) {
    next(error);
  }
}

export async function updateTask(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = updateTaskBodySchema.parse(req.body);
    const taskId = String(req.params.taskId ?? "");
    if (!mongoose.isValidObjectId(taskId)) throw new HttpError(400, "Invalid taskId");

    const task = await Task.findById(taskId);
    if (!task || (task as any).deletedAt) throw new HttpError(404, "Task not found");

    await requireWorkspaceMember({ userId: req.userId, workspaceId: String((task as any).workspaceId) });

    if (body.title !== undefined) (task as any).title = body.title;
    if (body.note !== undefined) (task as any).note = body.note;
    if (body.priority !== undefined) (task as any).priority = body.priority;
    if (body.status !== undefined) {
      (task as any).status = body.status;
      (task as any).completedAt = body.status === "done" ? new Date() : null;
    }
    if (body.dueAt !== undefined) (task as any).dueAt = body.dueAt ? new Date(body.dueAt) : null;
    if (body.order !== undefined) (task as any).order = body.order;

    await task.save();

    res.json({ task: task.toJSON() });
  } catch (error) {
    next(error);
  }
}

export async function deleteTask(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const taskId = String(req.params.taskId ?? "");
    if (!mongoose.isValidObjectId(taskId)) throw new HttpError(400, "Invalid taskId");

    const task = await Task.findById(taskId);
    if (!task || (task as any).deletedAt) throw new HttpError(404, "Task not found");

    await requireWorkspaceMember({ userId: req.userId, workspaceId: String((task as any).workspaceId) });

    (task as any).deletedAt = new Date();
    await task.save();

    res.json({ message: "Task deleted" });
  } catch (error) {
    next(error);
  }
}

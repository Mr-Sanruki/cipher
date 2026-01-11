import type { Response, NextFunction } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import type { AuthenticatedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { requireWorkspaceMember } from "../utils/access";
import { Habit } from "../models/Habit";

export const createHabitBodySchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1).max(100),
  color: z.string().max(32).optional().default("#25D366"),
});

export const updateHabitBodySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().max(32).optional(),
  toggleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  completed: z.boolean().optional(),
});

export async function listHabits(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const workspaceId = String(req.query.workspaceId ?? "");
    if (!mongoose.isValidObjectId(workspaceId)) throw new HttpError(400, "workspaceId is required");

    await requireWorkspaceMember({ userId: req.userId, workspaceId });

    const habits = await Habit.find({ workspaceId, deletedAt: null }).sort({ createdAt: -1 });

    res.json({ habits: habits.map((h) => h.toJSON()) });
  } catch (error) {
    next(error);
  }
}

export async function createHabit(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = createHabitBodySchema.parse(req.body);

    await requireWorkspaceMember({ userId: req.userId, workspaceId: body.workspaceId });

    const habit = await Habit.create({
      workspaceId: body.workspaceId,
      createdBy: req.userId,
      name: body.name,
      color: body.color,
      logs: [],
    });

    res.status(201).json({ habit: habit.toJSON() });
  } catch (error) {
    next(error);
  }
}

export async function updateHabit(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const habitId = String(req.params.habitId ?? "");
    if (!mongoose.isValidObjectId(habitId)) throw new HttpError(400, "Invalid habitId");

    const body = updateHabitBodySchema.parse(req.body);

    const habit = await Habit.findById(habitId);
    if (!habit || (habit as any).deletedAt) throw new HttpError(404, "Habit not found");

    await requireWorkspaceMember({ userId: req.userId, workspaceId: String((habit as any).workspaceId) });

    if (body.name !== undefined) (habit as any).name = body.name;
    if (body.color !== undefined) (habit as any).color = body.color;

    if (body.toggleDate) {
      const date = body.toggleDate;
      const completed = body.completed !== undefined ? body.completed : true;
      const logs = Array.isArray((habit as any).logs) ? ((habit as any).logs as any[]) : [];
      const idx = logs.findIndex((l) => String(l.date) === date);
      if (idx >= 0) {
        if (completed) {
          logs[idx] = { date, completed: true };
        } else {
          logs.splice(idx, 1);
        }
      } else {
        if (completed) logs.push({ date, completed: true });
      }
      (habit as any).logs = logs;
    }

    await habit.save();

    res.json({ habit: habit.toJSON() });
  } catch (error) {
    next(error);
  }
}

export async function deleteHabit(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const habitId = String(req.params.habitId ?? "");
    if (!mongoose.isValidObjectId(habitId)) throw new HttpError(400, "Invalid habitId");

    const habit = await Habit.findById(habitId);
    if (!habit || (habit as any).deletedAt) throw new HttpError(404, "Habit not found");

    await requireWorkspaceMember({ userId: req.userId, workspaceId: String((habit as any).workspaceId) });

    (habit as any).deletedAt = new Date();
    await habit.save();

    res.json({ message: "Habit deleted" });
  } catch (error) {
    next(error);
  }
}

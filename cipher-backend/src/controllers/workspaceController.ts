import type { Response, NextFunction } from "express";
import { z } from "zod";
import type { AuthenticatedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { Channel } from "../models/Channel";
import { Message } from "../models/Message";
import { User } from "../models/User";
import { Workspace } from "../models/Workspace";
import { logger } from "../utils/logger";
import { generateVerificationCode } from "../utils/generators";
import { requireWorkspaceAdmin, requireWorkspaceMember } from "../utils/access";

export const createWorkspaceBodySchema = z.object({
  name: z.string().min(2).max(60),
  description: z.string().max(500).optional().default(""),
});

export const joinWorkspaceBodySchema = z.object({
  verificationCode: z.string().min(4).max(32),
});

export const updateWorkspaceBodySchema = z.object({
  name: z.string().min(2).max(60).optional(),
  description: z.string().max(500).optional(),
  settings: z.record(z.any()).optional(),
});

export async function createWorkspace(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = createWorkspaceBodySchema.parse(req.body);

    const verificationCode = await generateUniqueWorkspaceCode();

    const workspace = await Workspace.create({
      name: body.name.trim(),
      description: body.description ?? "",
      verificationCode,
      createdBy: req.userId,
      members: [{ userId: req.userId, role: "admin" }],
      settings: {},
    });

    const general = await Channel.create({
      workspaceId: workspace._id,
      name: "general",
      description: "",
      isPrivate: false,
      type: "channel",
      createdBy: req.userId,
      members: [{ userId: req.userId }],
    });

    await Workspace.updateOne(
      { _id: workspace._id },
      {
        $set: {
          settings: { generalChannelId: String(general._id) },
        },
      },
    );

    res.status(201).json({ workspace: workspace.toJSON(), verificationCode });
  } catch (error) {
    next(error);
  }
}

export async function listWorkspaces(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const workspaces = await Workspace.find({ "members.userId": req.userId }).sort({ updatedAt: -1 });

    const workspaceIds = workspaces.map((w) => w._id);

    const statsByWorkspace = new Map<
      string,
      { channelCount: number; publicChannelCount: number; privateChannelCount: number; messageCount: number }
    >();

    if (workspaceIds.length > 0) {
      const channels = await Channel.find({
        workspaceId: { $in: workspaceIds },
        $or: [{ isPrivate: false }, { "members.userId": req.userId }],
      })
        .select({ _id: 1, workspaceId: 1, isPrivate: 1 })
        .lean();

      const channelIdToWorkspaceId = new Map<string, string>();
      for (const c of channels) {
        const wsId = String(c.workspaceId);
        const existing = statsByWorkspace.get(wsId) ?? {
          channelCount: 0,
          publicChannelCount: 0,
          privateChannelCount: 0,
          messageCount: 0,
        };

        existing.channelCount += 1;
        if (c.isPrivate) existing.privateChannelCount += 1;
        else existing.publicChannelCount += 1;

        statsByWorkspace.set(wsId, existing);
        channelIdToWorkspaceId.set(String(c._id), wsId);
      }

      const channelIds = channels.map((c) => c._id);
      if (channelIds.length > 0) {
        const messageCounts = await Message.aggregate([
          { $match: { channelId: { $in: channelIds }, deletedAt: null } },
          { $group: { _id: "$channelId", count: { $sum: 1 } } },
        ]);

        for (const row of messageCounts) {
          const wsId = channelIdToWorkspaceId.get(String((row as any)?._id ?? ""));
          if (!wsId) continue;
          const existing = statsByWorkspace.get(wsId);
          if (!existing) continue;
          existing.messageCount += Number((row as any)?.count ?? 0);
        }
      }
    }

    res.json({
      workspaces: workspaces.map((w) => {
        const json = w.toJSON();
        const memberCount = Array.isArray(w.members) ? (w.members as any[]).length : 0;
        const stats = statsByWorkspace.get(String(w._id)) ?? {
          channelCount: 0,
          publicChannelCount: 0,
          privateChannelCount: 0,
          messageCount: 0,
        };
        return { ...json, memberCount, ...stats };
      }),
    });
  } catch (error) {
    next(error);
  }
}

export async function joinWorkspace(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = joinWorkspaceBodySchema.parse(req.body);

    const workspace = await Workspace.findOne({ verificationCode: body.verificationCode.trim() });
    if (!workspace) {
      throw new HttpError(404, "Workspace not found");
    }

    const already = (workspace.members as any[]).some((m) => String(m.userId) === req.userId);
    if (!already) {
      workspace.members.push({ userId: req.userId, role: "member" } as any);
      await workspace.save();

      const generalId = (workspace.settings as any)?.generalChannelId;
      if (generalId) {
        await Channel.updateOne(
          { _id: generalId },
          {
            $addToSet: { members: { userId: req.userId } },
          },
        );
      }
    }

    res.json({ workspace: workspace.toJSON() });
  } catch (error) {
    next(error);
  }
}

export async function updateWorkspace(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = updateWorkspaceBodySchema.parse(req.body);

    const { workspace, role } = await requireWorkspaceMember({
      userId: req.userId,
      workspaceId: req.params.workspaceId,
    });
    requireWorkspaceAdmin(role);

    if (body.name !== undefined) workspace.name = body.name;
    if (body.description !== undefined) workspace.description = body.description;
    if (body.settings !== undefined)
      workspace.settings = { ...(workspace.settings as any), ...body.settings };

    await workspace.save();

    res.json({ workspace: workspace.toJSON() });
  } catch (error) {
    next(error);
  }
}

export async function listMembers(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { workspace } = await requireWorkspaceMember({
      userId: req.userId,
      workspaceId: req.params.workspaceId,
    });

    const memberIds = (workspace.members as any[]).map((m) => String(m.userId));
    const users = await User.find({ _id: { $in: memberIds } }).lean();

    const userMap = new Map(users.map((u: any) => [String(u._id), u]));

    res.json({
      members: (workspace.members as any[]).map((m) => {
        const user = userMap.get(String(m.userId));
        return {
          userId: String(m.userId),
          role: m.role,
          joinedAt: m.joinedAt,
          user: user
            ? {
                _id: String((user as any)._id),
                name: String((user as any).name ?? ""),
                email: String((user as any).email ?? ""),
                avatarUrl: String((user as any).avatarUrl ?? ""),
              }
            : null,
        };
      }),
    });
  } catch (error) {
    next(error);
  }
}

export const updateMemberRoleBodySchema = z.object({
  role: z.enum(["admin", "member", "guest"]),
});

export async function updateMemberRole(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = updateMemberRoleBodySchema.parse(req.body);
    const targetUserId = String(req.params.userId);

    const { workspace, role } = await requireWorkspaceMember({
      userId: req.userId,
      workspaceId: req.params.workspaceId,
    });
    requireWorkspaceAdmin(role);

    if (targetUserId === req.userId) {
      throw new HttpError(400, "You cannot change your own role");
    }

    const memberIndex = (workspace.members as any[]).findIndex((m) => String(m.userId) === targetUserId);
    if (memberIndex === -1) {
      throw new HttpError(404, "Member not found");
    }

    (workspace.members as any[])[memberIndex].role = body.role;
    await workspace.save();

    res.json({ message: "Member role updated" });
  } catch (error) {
    next(error);
  }
}

export async function removeMember(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const targetUserId = String(req.params.userId);

    const { workspace, role } = await requireWorkspaceMember({
      userId: req.userId,
      workspaceId: req.params.workspaceId,
    });
    requireWorkspaceAdmin(role);

    if (targetUserId === req.userId) {
      throw new HttpError(400, "You cannot remove yourself");
    }

    await Workspace.updateOne(
      { _id: workspace._id },
      {
        $pull: { members: { userId: targetUserId } },
      },
    );

    await Channel.updateMany(
      { workspaceId: workspace._id },
      {
        $pull: { members: { userId: targetUserId } },
      },
    );

    res.json({ message: "Member removed" });
  } catch (error) {
    next(error);
  }
}

export async function generateCode(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { workspace, role } = await requireWorkspaceMember({
      userId: req.userId,
      workspaceId: req.params.workspaceId,
    });
    requireWorkspaceAdmin(role);

    const verificationCode = await generateUniqueWorkspaceCode();
    workspace.verificationCode = verificationCode;
    await workspace.save();

    res.json({ verificationCode });
  } catch (error) {
    next(error);
  }
}

async function generateUniqueWorkspaceCode(): Promise<string> {
  for (let i = 0; i < 10; i += 1) {
    const code = generateVerificationCode();
    const exists = await Workspace.exists({ verificationCode: code });
    if (!exists) return code;
  }

  logger.error("Failed to generate unique verification code");
  throw new HttpError(500, "Failed to generate verification code");
}

import mongoose from "mongoose";
import { User } from "../models/User";

/**
 * Extract user IDs from mention patterns in text (@userId or @username)
 * Also supports @channel and @here special mentions
 */
export async function parseMentions(
  text: string,
  workspaceId: string,
): Promise<{
  userIds: mongoose.Types.ObjectId[];
  hasChannelMention: boolean;
  hasHereMention: boolean;
}> {
  const userIds: mongoose.Types.ObjectId[] = [];
  let hasChannelMention = false;
  let hasHereMention = false;

  // Match @userId (ObjectId format) or @username patterns
  const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
  const matches = text.matchAll(mentionRegex);

  const seenIds = new Set<string>();

  for (const match of matches) {
    const mention = match[1].toLowerCase();

    // Special mentions
    if (mention === "channel") {
      hasChannelMention = true;
      continue;
    }
    if (mention === "here") {
      hasHereMention = true;
      continue;
    }

    // Try to parse as ObjectId first
    if (mongoose.isValidObjectId(mention)) {
      const id = new mongoose.Types.ObjectId(mention);
      const idStr = String(id);
      if (!seenIds.has(idStr)) {
        seenIds.add(idStr);
        userIds.push(id);
      }
      continue;
    }

    // Try to find by name (case-insensitive)
    try {
      const user = await User.findOne({
        name: { $regex: new RegExp(`^${escapeRegex(mention)}$`, "i") },
      })
        .select({ _id: 1 })
        .lean();

      if (user) {
        const id = (user as any)._id;
        const idStr = String(id);
        if (!seenIds.has(idStr)) {
          seenIds.add(idStr);
          userIds.push(id);
        }
      }
    } catch {
      // Ignore errors when looking up users
    }
  }

  return { userIds, hasChannelMention, hasHereMention };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

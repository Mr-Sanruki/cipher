import { getJson, setJson } from "./storage";

const KEY_PREFIX = "cipher.chat.clearedAt";

type ClearedMap = Record<string, string>;

function keyForUser(userId: string): string {
  return `${KEY_PREFIX}.${userId}`;
}

function chatKey(type: "channel" | "dm", id: string): string {
  return `${type}:${id}`;
}

export async function getChatClearedAt(userId: string, type: "channel" | "dm", id: string): Promise<string | null> {
  if (!userId || !id) return null;
  const map = await getJson<ClearedMap>(keyForUser(userId));
  if (!map) return null;
  const v = map[chatKey(type, id)];
  return typeof v === "string" && v ? v : null;
}

export async function clearChatForMe(userId: string, type: "channel" | "dm", id: string): Promise<string> {
  const iso = new Date().toISOString();
  if (!userId || !id) return iso;
  const map = (await getJson<ClearedMap>(keyForUser(userId))) ?? {};
  await setJson(keyForUser(userId), { ...map, [chatKey(type, id)]: iso });
  return iso;
}

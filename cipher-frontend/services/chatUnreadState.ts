import { getJson, setJson } from "./storage";

const KEY_PREFIX = "cipher.chat.unread";

type UnreadMap = Record<string, number>;

function keyForUser(userId: string): string {
  return `${KEY_PREFIX}.${userId}`;
}

export async function getUnreadMap(userId: string): Promise<UnreadMap> {
  if (!userId) return {};
  const map = await getJson<UnreadMap>(keyForUser(userId));
  return map ?? {};
}

export async function setUnreadCount(userId: string, channelId: string, count: number): Promise<void> {
  if (!userId || !channelId) return;
  const map = await getUnreadMap(userId);
  const next = Math.max(0, Math.floor(count));
  await setJson(keyForUser(userId), { ...map, [channelId]: next });
}

export async function incrementUnreadCount(userId: string, channelId: string, by = 1): Promise<number> {
  if (!userId || !channelId) return 0;
  const map = await getUnreadMap(userId);
  const current = Number(map[channelId] ?? 0);
  const next = Math.max(0, current + Math.max(1, Math.floor(by)));
  await setJson(keyForUser(userId), { ...map, [channelId]: next });
  return next;
}

export async function clearUnreadCount(userId: string, channelId: string): Promise<void> {
  await setUnreadCount(userId, channelId, 0);
}

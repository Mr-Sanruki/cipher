import { getJson, setJson } from "./storage";

const KEY_PREFIX = "cipher.chat.lastRead";

type LastReadMap = Record<string, string>;

function keyForUser(userId: string): string {
  return `${KEY_PREFIX}.${userId}`;
}

export async function getLastReadMap(userId: string): Promise<LastReadMap> {
  if (!userId) return {};
  const map = await getJson<LastReadMap>(keyForUser(userId));
  return map ?? {};
}

export async function setChannelLastRead(userId: string, channelId: string, iso: string): Promise<void> {
  if (!userId || !channelId) return;
  const map = await getLastReadMap(userId);
  const existing = map[channelId];
  if (existing) {
    const ex = new Date(existing).getTime();
    const next = new Date(iso).getTime();
    if (!Number.isNaN(ex) && !Number.isNaN(next) && next <= ex) return;
  }
  await setJson(keyForUser(userId), { ...map, [channelId]: iso });
}

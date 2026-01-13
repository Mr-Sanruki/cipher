import { getItem, setItem } from "./storage";

const ACTIVE_WORKSPACE_KEY = "cipher.activeWorkspaceId";

const listeners = new Set<(workspaceId: string | null) => void>();

export async function getActiveWorkspaceId(): Promise<string | null> {
  const value = await getItem(ACTIVE_WORKSPACE_KEY);
  return value ? value : null;
}

export async function setActiveWorkspaceId(workspaceId: string): Promise<void> {
  await setItem(ACTIVE_WORKSPACE_KEY, workspaceId);

  for (const cb of Array.from(listeners)) {
    try {
      cb(workspaceId);
    } catch {
      // ignore
    }
  }
}

export function subscribeActiveWorkspaceId(listener: (workspaceId: string | null) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

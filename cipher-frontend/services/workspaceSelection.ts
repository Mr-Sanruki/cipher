import { getItem, setItem } from "./storage";

const ACTIVE_WORKSPACE_KEY = "cipher.activeWorkspaceId";

export async function getActiveWorkspaceId(): Promise<string | null> {
  const value = await getItem(ACTIVE_WORKSPACE_KEY);
  return value ? value : null;
}

export async function setActiveWorkspaceId(workspaceId: string): Promise<void> {
  await setItem(ACTIVE_WORKSPACE_KEY, workspaceId);
}

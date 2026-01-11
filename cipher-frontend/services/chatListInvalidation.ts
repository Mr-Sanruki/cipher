type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeChatListInvalidation(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function invalidateChatLists(): void {
  for (const l of Array.from(listeners)) {
    try {
      l();
    } catch {
      // ignore
    }
  }
}

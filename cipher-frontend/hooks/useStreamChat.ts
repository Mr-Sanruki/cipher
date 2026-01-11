import { useContext } from "react";
import { StreamChatContext } from "../context/StreamChatContext";

export function useStreamChat() {
  const ctx = useContext(StreamChatContext);
  if (!ctx) {
    throw new Error("useStreamChat must be used within StreamChatProvider");
  }
  return ctx;
}

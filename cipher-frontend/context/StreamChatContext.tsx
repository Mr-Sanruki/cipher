import React, { createContext, useEffect, useMemo, useState } from "react";
import { StreamChat } from "stream-chat";
import type { User } from "../types";
import { useAuth } from "../hooks/useAuth";
import { getStreamChatUserToken } from "../services/streamChat";

type StreamChatContextValue = {
  client: StreamChat | null;
  status: "disconnected" | "connecting" | "connected" | "error";
  error: string | null;
};

export const StreamChatContext = createContext<StreamChatContextValue | null>(null);

export function StreamChatProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const { status: authStatus, user } = useAuth();

  const [client, setClient] = useState<StreamChat | null>(null);
  const [status, setStatus] = useState<StreamChatContextValue["status"]>("disconnected");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function connect(u: User): Promise<void> {
      setStatus("connecting");
      setError(null);

      try {
        const { apiKey, token, userId } = await getStreamChatUserToken();
        if (!active) return;

        if (!apiKey || !token || !userId) {
          throw new Error("Failed to get Stream Chat token");
        }

        const chatClient = StreamChat.getInstance(apiKey);

        await chatClient.connectUser(
          {
            id: userId,
            name: u.name ?? "",
            image: u.avatarUrl ?? undefined,
          },
          token,
        );

        if (!active) {
          await chatClient.disconnectUser();
          return;
        }

        setClient(chatClient);
        setStatus("connected");
      } catch (e: any) {
        setClient(null);
        setStatus("error");
        setError(typeof e?.message === "string" ? e.message : "Failed to connect Stream Chat");
      }
    }

    async function disconnect(): Promise<void> {
      setStatus("disconnected");
      setError(null);

      const current = client;
      setClient(null);

      if (current) {
        try {
          await current.disconnectUser();
        } catch {
          // ignore
        }
      }
    }

    if (authStatus !== "authenticated" || !user) {
      void disconnect();
      return;
    }

    void connect(user);

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, user?._id]);

  const value = useMemo<StreamChatContextValue>(() => ({ client, status, error }), [client, status, error]);

  return <StreamChatContext.Provider value={value}>{children}</StreamChatContext.Provider>;
}

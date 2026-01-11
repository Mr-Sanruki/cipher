import React, { createContext, useEffect, useMemo, useState } from "react";
import type { CipherSocket } from "../services/socket";
import { connectSocket, disconnectSocket } from "../services/socket";
import { useAuth } from "../hooks/useAuth";

export type SocketStatus = "disconnected" | "connecting" | "connected";

type SocketContextValue = {
  socket: CipherSocket | null;
  status: SocketStatus;
};

export const SocketContext = createContext<SocketContextValue | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const { status: authStatus, token } = useAuth();

  const [socket, setSocket] = useState<CipherSocket | null>(null);
  const [status, setStatus] = useState<SocketStatus>("disconnected");

  useEffect(() => {
    if (authStatus !== "authenticated" || !token) {
      disconnectSocket();
      setSocket(null);
      setStatus("disconnected");
      return;
    }

    setStatus("connecting");
    let s: CipherSocket;
    try {
      s = connectSocket(token);
    } catch {
      disconnectSocket();
      setSocket(null);
      setStatus("disconnected");
      return;
    }
    setSocket(s);

    const onConnect = () => setStatus("connected");
    const onDisconnect = () => setStatus("disconnected");
    const onConnectError = () => setStatus("disconnected");

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("connect_error", onConnectError);

    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("connect_error", onConnectError);
    };
  }, [authStatus, token]);

  const value = useMemo<SocketContextValue>(() => ({ socket, status }), [socket, status]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

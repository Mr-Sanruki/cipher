import { io, type Socket } from "socket.io-client";
import type { ChatMessageDto, UserStatus } from "../types";
import { Platform } from "react-native";

export type CallType = "voice" | "video";

export type CallSignal =
  | { type: "offer"; sdp: string }
  | { type: "answer"; sdp: string }
  | { type: "candidate"; candidate: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null } };

export type DmMessageDto = {
  _id: string;
  dmId: string;
  sender: { _id: string; name: string; avatarUrl?: string };
  text: string;
  attachments: { url: string; type: string; name?: string; size?: number }[];
  createdAt: string;
  updatedAt: string;
};

export type ServerToClientEvents = {
  "receive-message": (payload: { message: ChatMessageDto }) => void;
  "receive-dm-message": (payload: { message: DmMessageDto }) => void;
  "message-edited": (payload: { messageId: string; text: string }) => void;
  "message-deleted": (payload: { messageId: string }) => void;
  "dm-message-deleted": (payload: { dmId: string; messageId: string }) => void;
  "user-typing": (payload: { userId: string }) => void;
  "user-stopped-typing": (payload: { userId: string }) => void;
  "message-read": (payload: { messageId: string; user?: { _id: string; name: string; avatarUrl?: string } }) => void;
  "message-reaction": (payload: { messageId: string; emoji: string; userId: string }) => void;
  "user-status-changed": (payload: { userId: string; status: UserStatus }) => void;
  "interview-participant-joined": (payload: { workspaceId: string; roomId: string; userId: string }) => void;
  "interview-participant-left": (payload: { workspaceId: string; roomId: string; userId: string }) => void;
  "interview-signal": (payload: { workspaceId: string; roomId: string; fromUserId: string; data: unknown }) => void;

  "call-incoming": (payload: { callId: string; dmId: string; type: CallType; fromUserId: string; toUserId: string }) => void;
  "call-accepted": (payload: { callId: string }) => void;
  "call-rejected": (payload: { callId: string }) => void;
  "call-ended": (payload: { callId: string }) => void;
  "call-signal": (payload: { callId: string; fromUserId: string; data: CallSignal }) => void;
};

export type ClientToServerEvents = {
  "join-workspace": (payload: { workspaceId: string }, ack?: (res: { ok: boolean; message?: string }) => void) => void;
  "leave-workspace": (payload: { workspaceId: string }, ack?: (res: { ok: boolean; message?: string }) => void) => void;
  "join-channel": (payload: { channelId: string }, ack?: (res: { ok: boolean; message?: string }) => void) => void;
  "leave-channel": (payload: { channelId: string }, ack?: (res: { ok: boolean; message?: string }) => void) => void;
  "interview-join": (
    payload: { workspaceId: string; roomId: string },
    ack?: (res: { ok: boolean; message?: string; isInitiator?: boolean }) => void
  ) => void;
  "interview-leave": (
    payload: { workspaceId: string; roomId: string },
    ack?: (res: { ok: boolean; message?: string }) => void
  ) => void;
  "interview-signal": (
    payload: { workspaceId: string; roomId: string; data: unknown },
    ack?: (res: { ok: boolean; message?: string }) => void
  ) => void;
  "send-message": (
    payload: { channelId: string; message: { text: string; attachments?: unknown[] } },
    ack?: (res: { ok: boolean; message?: ChatMessageDto; messageText?: string }) => void
  ) => void;
  "edit-message": (payload: { messageId: string; text: string }, ack?: (res: { ok: boolean; message?: string }) => void) => void;
  "delete-message": (payload: { messageId: string }, ack?: (res: { ok: boolean; message?: string }) => void) => void;
  typing: (payload: { channelId: string; userId: string }) => void;
  "stop-typing": (payload: { channelId: string; userId: string }) => void;
  "read-message": (payload: { messageId: string }, ack?: (res: { ok: boolean; message?: string }) => void) => void;
  "react-message": (
    payload: { messageId: string; emoji: string },
    ack?: (res: { ok: boolean; message?: string; reactions?: unknown }) => void
  ) => void;
  "user-online": (payload: { userId: string; status: UserStatus }) => void;

  "call-start": (
    payload: { callId: string; dmId: string; type: CallType; toUserId: string },
    ack?: (res: { ok: boolean; message?: string }) => void
  ) => void;
  "call-accept": (payload: { callId: string }, ack?: (res: { ok: boolean; message?: string }) => void) => void;
  "call-reject": (payload: { callId: string }, ack?: (res: { ok: boolean; message?: string }) => void) => void;
  "call-end": (payload: { callId: string }, ack?: (res: { ok: boolean; message?: string }) => void) => void;
  "call-signal": (payload: { callId: string; data: CallSignal }, ack?: (res: { ok: boolean; message?: string }) => void) => void;
};

export type CipherSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: CipherSocket | null = null;
let activeToken: string | null = null;

const DEFAULT_SOCKET_URL = "https://cipher-backend-4yns.onrender.com";

function resolveSocketUrl(): string | null {
  const url =
    process.env.EXPO_PUBLIC_SOCKET_URL?.trim() ||
    process.env.EXPO_PUBLIC_API_URL?.trim() ||
    process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ||
    DEFAULT_SOCKET_URL;
  if (Platform.OS === "web") {
    return url.replace(/^(https?:\/\/)\d{1,3}(?:\.\d{1,3}){3}:(\d+)$/i, "$1localhost:$2");
  }
  return url;
}

export function connectSocket(token: string): CipherSocket {
  const t = token.trim();
  if (!t) {
    throw new Error("Missing auth token");
  }

  const url = resolveSocketUrl();
  if (!url) {
    throw new Error("Missing EXPO_PUBLIC_SOCKET_URL (or EXPO_PUBLIC_API_URL / EXPO_PUBLIC_API_BASE_URL). Set it and restart Expo.");
  }

  if (socket && activeToken === t) return socket;

  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }

  activeToken = t;

  socket = io(url, {
    transports: ["websocket"],
    autoConnect: true,
    auth: { token: t },
  }) as CipherSocket;

  return socket;
}

export function disconnectSocket(): void {
  if (!socket) return;

  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
  activeToken = null;
}

export function getSocket(): CipherSocket | null {
  return socket;
}

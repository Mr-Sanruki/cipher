import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NativeModules, Platform, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { Colors } from "../utils/colors";
import { useAuth } from "../hooks/useAuth";
import { useSocket } from "../hooks/useSocket";

export type CallType = "voice" | "video";
export type CallDirection = "incoming" | "outgoing";
export type CallStatus = "idle" | "ringing" | "active";

export type ActiveCall = {
  callId: string;
  dmId: string;
  type: CallType;
  direction: CallDirection;
  fromUserId: string;
  toUserId: string;
  startedAt: string;
};

type CallContextValue = {
  activeCall: ActiveCall | null;
  status: CallStatus;
  startCall: (input: { dmId: string; toUserId: string; type: CallType }) => void;
  acceptCall: () => void;
  rejectCall: () => void;
  endCall: () => void;
};

export const CallContext = createContext<CallContextValue | null>(null);

function nowIso(): string {
  return new Date().toISOString();
}

export function CallProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const { user } = useAuth();
  const { socket } = useSocket();

  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [status, setStatus] = useState<CallStatus>("idle");

  const activeRef = useRef<ActiveCall | null>(null);
  useEffect(() => {
    activeRef.current = activeCall;
  }, [activeCall]);

  const myUserId = user?._id ?? "";

  const canUseWebrtc = useMemo(() => {
    if (Platform.OS === "web") return false;
    return Boolean((NativeModules as any)?.WebRTCModule);
  }, []);

  const clearCall = useCallback(() => {
    setActiveCall(null);
    setStatus("idle");
  }, []);

  const startCall = useCallback(
    (input: { dmId: string; toUserId: string; type: CallType }) => {
      if (!socket || !myUserId) return;
      if (!canUseWebrtc) {
        // still create ringing UI locally; the call screen will show a helpful message
      }

      const callId = `${myUserId}_${input.toUserId}_${Date.now()}`;
      const call: ActiveCall = {
        callId,
        dmId: input.dmId,
        type: input.type,
        direction: "outgoing",
        fromUserId: myUserId,
        toUserId: input.toUserId,
        startedAt: nowIso(),
      };

      setActiveCall(call);
      setStatus("ringing");

      socket.emit(
        "call-start",
        { callId, dmId: input.dmId, type: input.type, toUserId: input.toUserId },
        (res: { ok: boolean; message?: string }) => {
          if (!res?.ok) {
            clearCall();
          }
        },
      );

      router.push({ pathname: "/(app)/call/[callId]", params: { callId } });
    },
    [socket, myUserId, canUseWebrtc, clearCall],
  );

  const acceptCall = useCallback(() => {
    const c = activeRef.current;
    if (!socket || !c) return;
    socket.emit("call-accept", { callId: c.callId }, () => {
      // ignore ack
    });
    setStatus("active");
    router.push({ pathname: "/(app)/call/[callId]", params: { callId: c.callId } });
  }, [socket]);

  const rejectCall = useCallback(() => {
    const c = activeRef.current;
    if (!socket || !c) return;
    socket.emit("call-reject", { callId: c.callId }, () => {
      // ignore ack
    });
    clearCall();
  }, [socket, clearCall]);

  const endCall = useCallback(() => {
    const c = activeRef.current;
    if (!socket || !c) {
      clearCall();
      return;
    }
    socket.emit("call-end", { callId: c.callId }, () => {
      // ignore ack
    });
    clearCall();
  }, [socket, clearCall]);

  useEffect(() => {
    if (!socket || !myUserId) return;

    const onIncoming = (payload: any) => {
      const callId = String(payload?.callId ?? "");
      const dmId = String(payload?.dmId ?? "");
      const type = (payload?.type === "video" ? "video" : "voice") as CallType;
      const fromUserId = String(payload?.fromUserId ?? "");
      const toUserId = String(payload?.toUserId ?? "");
      if (!callId || !dmId || !fromUserId || !toUserId) return;
      if (toUserId !== myUserId) return;

      const call: ActiveCall = {
        callId,
        dmId,
        type,
        direction: "incoming",
        fromUserId,
        toUserId,
        startedAt: nowIso(),
      };

      setActiveCall(call);
      setStatus("ringing");
    };

    const onAccepted = (payload: any) => {
      const callId = String(payload?.callId ?? "");
      if (!callId) return;
      if (activeRef.current?.callId !== callId) return;
      setStatus("active");
    };

    const onEnded = (payload: any) => {
      const callId = String(payload?.callId ?? "");
      if (!callId) return;
      if (activeRef.current?.callId !== callId) return;
      clearCall();
    };

    const onRejected = (payload: any) => {
      const callId = String(payload?.callId ?? "");
      if (!callId) return;
      if (activeRef.current?.callId !== callId) return;
      clearCall();
    };

    socket.on("call-incoming", onIncoming);
    socket.on("call-accepted", onAccepted);
    socket.on("call-ended", onEnded);
    socket.on("call-rejected", onRejected);

    return () => {
      socket.off("call-incoming", onIncoming);
      socket.off("call-accepted", onAccepted);
      socket.off("call-ended", onEnded);
      socket.off("call-rejected", onRejected);
    };
  }, [socket, myUserId, clearCall]);

  const value = useMemo<CallContextValue>(
    () => ({
      activeCall,
      status,
      startCall,
      acceptCall,
      rejectCall,
      endCall,
    }),
    [activeCall, status, startCall, acceptCall, rejectCall, endCall],
  );

  return (
    <CallContext.Provider value={value}>
      {children}
      {activeCall && status === "ringing" && activeCall.direction === "incoming" ? (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            paddingTop: 44,
            paddingBottom: 10,
            paddingHorizontal: 12,
            backgroundColor: "#0b141a",
            borderBottomWidth: 1,
            borderBottomColor: "rgba(255,255,255,0.08)",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            zIndex: 9999,
          }}
        >
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={{ color: Colors.dark.textSecondary, fontSize: 12 }} numberOfLines={1}>
              Incoming {activeCall.type === "video" ? "video" : "voice"} call
            </Text>
            <Text style={{ color: Colors.dark.textPrimary, fontWeight: "800" }} numberOfLines={1}>
              Tap to join
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={rejectCall}
              style={({ pressed }) => ({
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 999,
                backgroundColor: pressed ? "rgba(255,59,48,0.7)" : "rgba(255,59,48,1)",
              })}
            >
              <Text style={{ color: "white", fontWeight: "800" }}>Decline</Text>
            </Pressable>
            <Pressable
              onPress={acceptCall}
              style={({ pressed }) => ({
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 999,
                backgroundColor: pressed ? "rgba(37,211,102,0.7)" : "rgba(37,211,102,1)",
              })}
            >
              <Text style={{ color: "white", fontWeight: "800" }}>Join</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </CallContext.Provider>
  );
}

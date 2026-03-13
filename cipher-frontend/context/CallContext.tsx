import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NativeModules, Platform, Pressable, Text, View, Vibration, Animated, Easing } from "react-native";
import { router } from "expo-router";
import { Colors } from "../utils/colors";
import { useAuth } from "../hooks/useAuth";
import { useSocket } from "../hooks/useSocket";
import { Ionicons } from "@expo/vector-icons";

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
  const [callerInfo, setCallerInfo] = useState<{ name: string; avatar?: string } | null>(null);
  const [pulseAnim] = useState(new Animated.Value(1));

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
    setCallerInfo(null);
    Vibration.cancel();
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
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
    return () => {
      pulseAnim.stopAnimation();
    };
  }, [pulseAnim]);

  useEffect(() => {
    if (!socket || !myUserId) return;

    const onIncoming = async (payload: any) => {
      const callId = String(payload?.callId ?? "");
      const dmId = String(payload?.dmId ?? "");
      const type = (payload?.type === "video" ? "video" : "voice") as CallType;
      const fromUserId = String(payload?.fromUserId ?? "");
      const toUserId = String(payload?.toUserId ?? "");
      const callerName = String(payload?.callerName ?? "Unknown");
      const callerAvatar = String(payload?.callerAvatar ?? "");
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

      setCallerInfo({ name: callerName, avatar: callerAvatar });
      setActiveCall(call);
      setStatus("ringing");

      Vibration.vibrate([0, 500, 500, 500], true);
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
            paddingTop: 60,
            paddingBottom: 16,
            paddingHorizontal: 16,
            backgroundColor: "rgba(11, 20, 26, 0.98)",
            borderBottomWidth: 1,
            borderBottomColor: "rgba(37, 211, 102, 0.3)",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            zIndex: 9999,
            shadowColor: "#25D366",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 12,
            elevation: 10,
          }}
        >
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <View style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: "rgba(37, 211, 102, 0.2)",
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 2,
              borderColor: "#25D366",
            }}>
              <Ionicons name={activeCall.type === "video" ? "videocam" : "call"} size={24} color="#25D366" />
            </View>
          </Animated.View>
          <View style={{ flex: 1, paddingHorizontal: 14 }}>
            <Text style={{ color: "#25D366", fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" }}>
              Incoming {activeCall.type} call
            </Text>
            <Text style={{ color: "#fff", fontSize: 17, fontWeight: "800", marginTop: 2 }} numberOfLines={1}>
              {callerInfo?.name || "Unknown Caller"}
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <Pressable
              onPress={rejectCall}
              style={({ pressed }: { pressed: boolean }) => ({
                width: 48,
                height: 48,
                borderRadius: 24,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pressed ? "rgba(255,59,48,0.7)" : "rgba(255,59,48,1)",
                shadowColor: "#FF3B30",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.3,
                shadowRadius: 4,
              })}
            >
              <Ionicons name="call" size={20} color="white" style={{ transform: [{ rotate: '135deg' }] }} />
            </Pressable>
            <Pressable
              onPress={acceptCall}
              style={({ pressed }: { pressed: boolean }) => ({
                width: 48,
                height: 48,
                borderRadius: 24,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pressed ? "rgba(37,211,102,0.7)" : "#25D366",
                shadowColor: "#25D366",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.4,
                shadowRadius: 6,
              })}
            >
              <Ionicons name={activeCall.type === "video" ? "videocam" : "call"} size={22} color="white" />
            </Pressable>
          </View>
        </View>
      ) : null}
    </CallContext.Provider>
  );
}


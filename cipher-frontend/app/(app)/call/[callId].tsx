import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, NativeModules, Platform, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Colors } from "../../../utils/colors";
import { useCall } from "../../../hooks/useCall";
import { useSocket } from "../../../hooks/useSocket";
import type { CallSignal, CallType } from "../../../services/socket";
import { useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { PremiumScreen } from "../../../components/PremiumScreen";
import { useAuth } from "../../../hooks/useAuth";
import { getDm } from "../../../services/dms";
import { getStreamVideoUserToken } from "../../../services/stream";
import {
  ParticipantView,
  StreamCall,
  StreamVideo,
  StreamVideoClient,
  useCallStateHooks,
} from "@stream-io/video-react-native-sdk";

function CallVideoContent(): JSX.Element {
  const hooks = useCallStateHooks();
  const localParticipant = hooks.useLocalParticipant();
  const remoteParticipants = hooks.useRemoteParticipants();
  const remoteParticipant = remoteParticipants?.[0] ?? null;

  return (
    <View style={{ flex: 1 }}>
      {remoteParticipant ? (
        <ParticipantView participant={remoteParticipant as any} style={{ flex: 1 }} objectFit="cover" videoZOrder={0} />
      ) : (
        <View style={{ flex: 1, backgroundColor: "#111" }} />
      )}
      {localParticipant ? (
        <View
          style={{
            position: "absolute",
            right: 12,
            top: 90,
            width: 110,
            height: 160,
            borderRadius: 10,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.2)",
          }}
        >
          <ParticipantView participant={localParticipant as any} style={{ width: "100%", height: "100%" }} objectFit="cover" videoZOrder={1} />
        </View>
      ) : null}
    </View>
  );
}

let InCallManager: any;
try {
  InCallManager = require("react-native-incall-manager");
} catch {
  InCallManager = null;
}

function toErrorMessage(error: unknown): string {
  return typeof (error as any)?.message === "string" ? String((error as any).message) : "Request failed";
}

function isSignal(value: unknown): value is CallSignal {
  const t = (value as any)?.type;
  if (t !== "offer" && t !== "answer" && t !== "candidate") return false;
  if (t === "offer" || t === "answer") {
    return typeof (value as any)?.sdp === "string";
  }
  const c = (value as any)?.candidate;
  return c && typeof c.candidate === "string";
}

export default function CallScreen(): JSX.Element {
  const params = useLocalSearchParams<{ callId?: string }>();
  const callId = String(params.callId ?? "");

  const navigation = useNavigation();

  const { socket, status: socketStatus } = useSocket();
  const { activeCall, status: callStatus, endCall } = useCall();
  const { user } = useAuth();

  const [streamClient, setStreamClient] = useState<any | null>(null);
  const [streamCall, setStreamCall] = useState<any | null>(null);
  const streamClientRef = useRef<any | null>(null);
  const streamCallRef = useRef<any | null>(null);
  const joiningRef = useRef(false);
  const cleanedUpRef = useRef(false);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [debugOpen, setDebugOpen] = useState<boolean>(false);

  const [muted, setMuted] = useState<boolean>(false);
  const [speaker, setSpeaker] = useState<boolean>(false);
  const [sharing, setSharing] = useState<boolean>(false);
  const [shareUnsupported, setShareUnsupported] = useState<boolean>(false);

  const [otherName, setOtherName] = useState<string>("");
  const [otherAvatar, setOtherAvatar] = useState<string>("");
  const [elapsedSec, setElapsedSec] = useState<number>(0);

  const callType: CallType = (activeCall?.type ?? "voice") as CallType;
  const isInitiator = activeCall?.direction === "outgoing";
  const myUserId = user?._id ?? "";

  useEffect(() => {
    let mounted = true;
    const dmId = String(activeCall?.dmId ?? "");
    if (!dmId) return;

    void (async () => {
      try {
        const dm = await getDm(dmId);
        if (!mounted) return;
        const other = (dm.participants ?? []).find((p) => String(p.userId) !== myUserId);
        const name = String(other?.user?.name ?? "").trim();
        const avatarUrl = String(other?.user?.avatarUrl ?? "").trim();
        setOtherName(name);
        setOtherAvatar(avatarUrl);
      } catch {
        // ignore
      }
    })();

    return () => {
      mounted = false;
    };
  }, [activeCall?.dmId, myUserId]);

  useEffect(() => {
    if (callStatus !== "active") {
      setElapsedSec(0);
      return;
    }
    const startedAt = activeCall?.startedAt ? new Date(activeCall.startedAt).getTime() : Date.now();
    const id = setInterval(() => {
      const sec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      setElapsedSec(sec);
    }, 500);
    return () => clearInterval(id);
  }, [callStatus, activeCall?.startedAt]);

  useEffect(() => {
    if (!InCallManager) return;
    if (!activeCall || activeCall.callId !== callId) return;

    try {
      // Start audio focus and route.
      InCallManager.start({ media: callType === "video" ? "video" : "audio" });
      InCallManager.setMicrophoneMute(false);
      const wantSpeaker = callType === "video" ? true : Boolean(speaker);
      InCallManager.setSpeakerphoneOn(Boolean(wantSpeaker));
      if (typeof InCallManager.setForceSpeakerphoneOn === "function") {
        InCallManager.setForceSpeakerphoneOn(Boolean(wantSpeaker));
      }
    } catch {
      // ignore
    }

    return () => {
      try {
        InCallManager.stop();
      } catch {
        // ignore
      }
    };
  }, [activeCall, callId, callType, speaker]);

  useEffect(() => {
    if (callType === "video") {
      setSpeaker(true);
    }
  }, [callType]);

  useEffect(() => {
    if (callType !== "video" && Platform.OS === "android") {
      setSpeaker(true);
    }
  }, [callType]);

  const cleanup = useCallback(async () => {
    if (cleanedUpRef.current) return;
    cleanedUpRef.current = true;

    setSharing(false);
    setShareUnsupported(false);

    try {
      const c = streamCallRef.current;
      if (c) {
        await c.leave();
      }
    } catch {
      // ignore
    } finally {
      streamCallRef.current = null;
      setStreamCall(null);
    }

    try {
      const client = streamClientRef.current;
      if (client) {
        await client.disconnectUser();
      }
    } catch {
      // ignore
    } finally {
      streamClientRef.current = null;
      setStreamClient(null);
    }
  }, []);

  useEffect(() => {
    if (!callId) return;
    if (!activeCall || activeCall.callId !== callId) {
      // If user navigated here directly, just show UI; allow joining from banner.
    }
  }, [activeCall, callId]);

  useEffect(() => {
    if (!socket || socketStatus !== "connected") return;
    if (!activeCall || activeCall.callId !== callId) return;
    if (callStatus !== "active" && activeCall.direction === "incoming") return;

    if (joiningRef.current) return;
    joiningRef.current = true;
    cleanedUpRef.current = false;

    setError(null);
    setBusy(true);
    void (async () => {
      try {
        const tokenResp = await getStreamVideoUserToken();
        if (!tokenResp.apiKey || !tokenResp.token || !tokenResp.userId) {
          throw new Error("Stream video token unavailable");
        }

        const client = new StreamVideoClient(tokenResp.apiKey as any);
        await client.connectUser({ id: tokenResp.userId } as any, tokenResp.token as any);
        streamClientRef.current = client;
        setStreamClient(client);

        const type = "default";
        const call = client.call(type, callId);
        streamCallRef.current = call;
        setStreamCall(call);

        await call.join({ create: true, notify: false, ring: Boolean(isInitiator), video: callType === "video" } as any);

        try {
          if (callType !== "video") {
            await call.camera.disable();
          } else {
            await call.camera.enable();
          }
        } catch {
          // ignore
        }

        try {
          await call.microphone.enable();
        } catch {
          // ignore
        }
      } catch (e) {
        setError(toErrorMessage(e));
      } finally {
        setBusy(false);
        joiningRef.current = false;
      }
    })();

    return () => {
      // keep connection until end
    };
  }, [socket, socketStatus, callId, activeCall, callStatus, isInitiator]);

  useEffect(() => {
    return () => {
      void cleanup();
    };
  }, [cleanup]);

  const title = useMemo(() => {
    if (activeCall?.type === "video") return "Video call";
    return "Voice call";
  }, [activeCall?.type]);

  const connected = callStatus === "active";
  const callTimer = useMemo(() => {
    const m = Math.floor(elapsedSec / 60);
    const s = elapsedSec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, [elapsedSec]);

  const debugText = useMemo(() => {
    const parts: string[] = [];
    parts.push(`socket: ${socketStatus}`);
    parts.push(`call: ${callStatus}`);
    parts.push(`type: ${callType}`);
    parts.push(`sharing: ${sharing ? "yes" : "no"}`);
    parts.push(`webrtc: ${false}`);
    parts.push(`remote: ${false}`);
    parts.push(`local: ${false}`);
    return parts.join("\n");
  }, [socketStatus, callStatus, callType, sharing]);

  const onHangup = useCallback(() => {
    endCall();
    void cleanup();
    router.back();
  }, [endCall, cleanup]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    try {
      const c = streamCallRef.current;
      if (c?.microphone && typeof c.microphone.toggle === "function") {
        void c.microphone.toggle();
      }
    } catch {
      // ignore
    }
  }, [muted]);

  const toggleSpeaker = useCallback(() => {
    const next = !speaker;
    setSpeaker(next);

    try {
      if (InCallManager && typeof InCallManager.setSpeakerphoneOn === "function") {
        InCallManager.setSpeakerphoneOn(Boolean(next));
      }
      if (InCallManager && typeof InCallManager.setForceSpeakerphoneOn === "function") {
        InCallManager.setForceSpeakerphoneOn(next ? 1 : 0);
      }
    } catch {
      // ignore
    }
  }, [speaker]);

  const unavailable = Platform.OS === "web" || !streamClient || !streamCall;

  return (
    <PremiumScreen padded={false} topPadding={0}>
      <View style={{ paddingTop: 52, paddingHorizontal: 14, paddingBottom: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Pressable onPress={onHangup} style={{ padding: 10 }}>
          <Ionicons name="chevron-back" size={24} color="white" />
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={{ color: "white", fontWeight: "900" }} numberOfLines={1}>
            {otherName || title}
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }} numberOfLines={1}>
            {connected ? callTimer : isInitiator ? "Calling…" : "Connecting…"}
          </Text>
        </View>
        <Pressable
          onPress={() => setDebugOpen((v) => !v)}
          style={({ pressed }) => ({ padding: 10, opacity: pressed ? 0.7 : 1 })}
        >
          <Ionicons name={debugOpen ? "bug" : "bug-outline"} size={20} color="white" />
        </Pressable>
      </View>

      {unavailable ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 }}>
          <Text style={{ color: "white", fontWeight: "900", marginBottom: 10 }}>Calls unavailable</Text>
          <Text style={{ color: "rgba(255,255,255,0.7)", textAlign: "center" }}>Use a development build to enable calls.</Text>
        </View>
      ) : callType === "video" ? (
        <StreamVideo client={streamClient as any}>
          <StreamCall call={streamCall as any}>
            <CallVideoContent />
          </StreamCall>
        </StreamVideo>
      ) : (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 }}>
          <View
            style={{
              width: 148,
              height: 148,
              borderRadius: 999,
              backgroundColor: "rgba(255,255,255,0.08)",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              marginBottom: 18,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
            }}
          >
            {otherAvatar ? (
              <Image source={{ uri: otherAvatar }} style={{ width: 148, height: 148 }} />
            ) : (
              <Text style={{ color: "white", fontWeight: "900", fontSize: 44 }}>
                {String(otherName || "U").trim().slice(0, 1).toUpperCase()}
              </Text>
            )}
          </View>
          <Text style={{ color: "white", fontWeight: "900", fontSize: 18 }}>
            {connected ? "Connected" : isInitiator ? "Calling…" : "Connecting…"}
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.7)", marginTop: 6 }}>
            {connected ? callTimer : busy ? "Starting call" : ""}
          </Text>
        </View>
      )}

      {error ? (
        <View style={{ position: "absolute", bottom: 120, left: 12, right: 12, padding: 12, borderRadius: 12, backgroundColor: "rgba(255,59,48,0.2)", borderWidth: 1, borderColor: "rgba(255,59,48,0.4)" }}>
          <Text style={{ color: "white" }}>{error}</Text>
        </View>
      ) : null}

      {debugOpen ? (
        <View
          style={{
            position: "absolute",
            top: 92,
            left: 12,
            right: 12,
            padding: 12,
            borderRadius: 12,
            backgroundColor: "rgba(0,0,0,0.55)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.12)",
          }}
        >
          <Text style={{ color: "rgba(255,255,255,0.9)", fontWeight: "800", marginBottom: 6 }}>Debug</Text>
          <Text style={{ color: "rgba(255,255,255,0.75)", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>{debugText}</Text>
        </View>
      ) : null}

      <View style={{ paddingHorizontal: 16, paddingBottom: 26, paddingTop: 14, flexDirection: "row", justifyContent: "space-between", gap: 10, backgroundColor: "rgba(0,0,0,0.25)" }}>
        {callType === "video" ? (
          <Pressable
            onPress={() => {
              try {
                const c = streamCallRef.current;
                if (!c?.screenShare || typeof c.screenShare.toggle !== "function") {
                  setShareUnsupported(true);
                  setError("Screen share is not supported on this device/build.");
                  return;
                }
                void c.screenShare.toggle();
                setSharing((v) => !v);
              } catch {
                setError("Screen share failed");
              }
            }}
            style={({ pressed }) => ({
              flex: 1,
              paddingVertical: 12,
              borderRadius: 999,
              backgroundColor: busy || shareUnsupported ? "rgba(255,255,255,0.06)" : pressed ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.12)",
              alignItems: "center",
            })}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, opacity: busy || shareUnsupported ? 0.6 : 1 }}>
              <Ionicons name={sharing ? "stop-circle" : "share-outline"} size={20} color="white" />
              <Text style={{ color: "white", fontWeight: "800" }}>{sharing ? "Stop" : "Share"}</Text>
            </View>
          </Pressable>
        ) : null}
        <Pressable
          onPress={toggleMute}
          style={({ pressed }) => ({ flex: 1, paddingVertical: 12, borderRadius: 999, backgroundColor: pressed ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.12)", alignItems: "center" })}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name={muted ? "mic-off" : "mic"} size={18} color="white" />
            <Text style={{ color: "white", fontWeight: "800" }}>{muted ? "Unmute" : "Mute"}</Text>
          </View>
        </Pressable>
        <Pressable
          onPress={toggleSpeaker}
          style={({ pressed }) => ({ flex: 1, paddingVertical: 12, borderRadius: 999, backgroundColor: pressed ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.12)", alignItems: "center" })}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name={speaker ? "volume-high" : "ear"} size={18} color="white" />
            <Text style={{ color: "white", fontWeight: "800" }}>{speaker ? "Speaker" : "Earpiece"}</Text>
          </View>
        </Pressable>
        <Pressable
          onPress={onHangup}
          style={({ pressed }) => ({ flex: 1, paddingVertical: 12, borderRadius: 999, backgroundColor: pressed ? "rgba(255,59,48,0.7)" : "rgba(255,59,48,1)", alignItems: "center" })}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="call" size={18} color="white" />
            <Text style={{ color: "white", fontWeight: "900" }}>End</Text>
          </View>
        </Pressable>
      </View>

      {shareUnsupported ? (
        <View style={{ position: "absolute", bottom: 184, left: 12, right: 12, padding: 12, borderRadius: 12, backgroundColor: "rgba(255,149,0,0.2)", borderWidth: 1, borderColor: "rgba(255,149,0,0.4)" }}>
          <Text style={{ color: "white" }}>Screen sharing is not supported in this build.</Text>
        </View>
      ) : null}

      <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: 44, backgroundColor: "black" }} />
    </PremiumScreen>
  );
}

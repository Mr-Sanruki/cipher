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

  type WebRTCLib = typeof import("react-native-webrtc");
  const [webrtc, setWebrtc] = useState<WebRTCLib | null>(null);
  const [RTCViewComponent, setRTCViewComponent] = useState<any>(null);
  const [webrtcUnavailableMessage, setWebrtcUnavailableMessage] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [debugOpen, setDebugOpen] = useState<boolean>(false);

  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);

  const [muted, setMuted] = useState<boolean>(false);
  const [speaker, setSpeaker] = useState<boolean>(false);
  const [sharing, setSharing] = useState<boolean>(false);
  const [shareUnsupported, setShareUnsupported] = useState<boolean>(false);

  const [otherName, setOtherName] = useState<string>("");
  const [otherAvatar, setOtherAvatar] = useState<string>("");
  const [elapsedSec, setElapsedSec] = useState<number>(0);

  const pcRef = useRef<any | null>(null);
  const localStreamRef = useRef<any | null>(null);
  const screenStreamRef = useRef<any | null>(null);
  const cameraVideoTrackRef = useRef<any | null>(null);
  const remoteDescSetRef = useRef(false);
  const pendingCandidatesRef = useRef<{ candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null }[]>([]);

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
      InCallManager.setSpeakerphoneOn(Boolean(speaker));
      if (typeof InCallManager.setForceSpeakerphoneOn === "function") {
        InCallManager.setForceSpeakerphoneOn(Boolean(speaker));
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

  const canUseWebrtc = useMemo(() => {
    if (Platform.OS === "web") return false;
    return Boolean((NativeModules as any)?.WebRTCModule);
  }, []);

  useEffect(() => {
    const parent = (navigation as any)?.getParent?.();
    if (!parent) return;
    parent.setOptions({ tabBarStyle: { display: "none" } });
    return () => {
      parent.setOptions({ tabBarStyle: { backgroundColor: Colors.dark.card, borderTopColor: Colors.dark.border } });
    };
  }, [navigation]);

  useEffect(() => {
    let active = true;

    void (async () => {
      if (Platform.OS === "web") {
        if (active) setWebrtcUnavailableMessage("WebRTC calls are not supported on web.");
        return;
      }

      try {
        const mod = await import("react-native-webrtc");
        if (!(NativeModules as any)?.WebRTCModule) {
          if (active) {
            setWebrtc(null);
            setRTCViewComponent(null);
            setWebrtcUnavailableMessage("WebRTC is unavailable in Expo Go. Use a development build to enable calls.");
          }
          return;
        }

        try {
          mod.registerGlobals();
        } catch {
          if (active) {
            setWebrtc(null);
            setRTCViewComponent(null);
            setWebrtcUnavailableMessage("WebRTC is unavailable in this build.");
          }
          return;
        }

        if (active) {
          setWebrtc(mod);
          setRTCViewComponent(() => (mod as any)?.RTCView ?? null);
        }
      } catch {
        if (active) {
          setWebrtc(null);
          setRTCViewComponent(null);
          setWebrtcUnavailableMessage("WebRTC is unavailable in Expo Go. Use a development build to enable calls.");
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const cleanup = useCallback(() => {
    remoteDescSetRef.current = false;
    pendingCandidatesRef.current = [];

    if (screenStreamRef.current) {
      try {
        screenStreamRef.current.getTracks().forEach((t: any) => t.stop());
      } catch {
        // ignore
      } finally {
        screenStreamRef.current = null;
      }
    }
    cameraVideoTrackRef.current = null;
    setSharing(false);

    if (pcRef.current) {
      try {
        (pcRef.current as any).onicecandidate = null;
        (pcRef.current as any).onaddstream = null;
        (pcRef.current as any).ontrack = null;
        pcRef.current.close();
      } catch {
        // ignore
      } finally {
        pcRef.current = null;
      }
    }

    if (localStreamRef.current) {
      try {
        localStreamRef.current.getTracks().forEach((t: any) => t.stop());
      } catch {
        // ignore
      } finally {
        localStreamRef.current = null;
      }
    }

    setLocalUrl(null);
    setRemoteUrl(null);
  }, []);

  const ensureLocalStream = useCallback(async (): Promise<any> => {
    if (!webrtc) {
      throw new Error(webrtcUnavailableMessage || "WebRTC is unavailable");
    }
    if (localStreamRef.current) return localStreamRef.current;

    const wantVideo = callType === "video";
    const stream = await webrtc.mediaDevices.getUserMedia({ audio: true, video: wantVideo });
    try {
      const camTrack = wantVideo ? stream.getVideoTracks?.()[0] : null;
      cameraVideoTrackRef.current = camTrack ?? null;
    } catch {
      cameraVideoTrackRef.current = null;
    }
    localStreamRef.current = stream;
    setLocalUrl((stream as any).toURL ? (stream as any).toURL() : null);
    return stream;
  }, [webrtc, webrtcUnavailableMessage, callType]);

  const ensurePeerConnection = useCallback(async (): Promise<any> => {
    if (!webrtc) throw new Error(webrtcUnavailableMessage || "WebRTC is unavailable");
    if (!socket) throw new Error("Not connected");
    if (pcRef.current) return pcRef.current;

    const pc = new webrtc.RTCPeerConnection({
      iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
    } as any);

    (pc as any).onicecandidate = (event: any) => {
      const cand = event?.candidate;
      if (!cand) return;
      const payload: CallSignal = {
        type: "candidate",
        candidate: {
          candidate: String(cand.candidate ?? ""),
          sdpMid: cand.sdpMid ?? null,
          sdpMLineIndex: typeof cand.sdpMLineIndex === "number" ? cand.sdpMLineIndex : null,
        },
      };
      socket.emit("call-signal", { callId, data: payload });
    };

    (pc as any).onaddstream = (event: any) => {
      const stream = event?.stream as any;
      if (!stream) return;
      setRemoteUrl((stream as any).toURL ? (stream as any).toURL() : null);
    };

    (pc as any).ontrack = (event: any) => {
      const stream = (event?.streams?.[0] as any) ?? null;
      if (!stream) return;
      setRemoteUrl((stream as any).toURL ? (stream as any).toURL() : null);
    };

    const local = await ensureLocalStream();
    try {
      local.getTracks().forEach((track: any) => {
        pc.addTrack(track, local);
      });
    } catch {
      // ignore
    }

    pcRef.current = pc;
    return pc;
  }, [webrtc, webrtcUnavailableMessage, socket, ensureLocalStream, callId]);

  const canShareScreen = useMemo(() => {
    if (!webrtc) return false;
    if (callType !== "video") return false;
    const md: any = (webrtc as any).mediaDevices;
    return typeof md?.getDisplayMedia === "function";
  }, [webrtc, callType]);

  const renegotiate = useCallback(async () => {
    if (!socket) return;
    const pc = pcRef.current;
    if (!pc) return;

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("call-signal", { callId, data: { type: "offer", sdp: String(offer.sdp ?? "") } });
    } catch {
      // ignore
    }
  }, [socket, callId]);

  const swapOutgoingVideoTrack = useCallback(
    async (nextTrack: any, nextStream: any) => {
      const pc: any = pcRef.current;
      if (!pc) return;

      const senders: any[] = pc?.getSenders?.() ?? [];
      const videoSender = senders.find((s) => s?.track && s.track.kind === "video") ?? null;

      // Try replaceTrack first (best UX)
      if (videoSender && typeof videoSender.replaceTrack === "function") {
        try {
          await videoSender.replaceTrack(nextTrack);
          // Some devices/Android builds require renegotiation to reliably update the remote track.
          await renegotiate();
          return;
        } catch {
          // fall through to renegotiation fallback
        }
      }

      // Fallback: removeTrack + addTrack + renegotiate (Android-safe)
      try {
        if (videoSender && typeof pc.removeTrack === "function") {
          pc.removeTrack(videoSender);
        }
      } catch {
        // ignore
      }

      try {
        pc.addTrack(nextTrack, nextStream);
      } catch {
        // ignore
      }

      await renegotiate();
    },
    [renegotiate],
  );

  const stopScreenShare = useCallback(async () => {
    try {
      const cameraTrack: any = cameraVideoTrackRef.current;
      const local = localStreamRef.current;
      if (cameraTrack && local) {
        await swapOutgoingVideoTrack(cameraTrack, local);
      }
    } catch {
      // ignore
    }

    if (screenStreamRef.current) {
      try {
        screenStreamRef.current.getTracks().forEach((t: any) => t.stop());
      } catch {
        // ignore
      } finally {
        screenStreamRef.current = null;
      }
    }

    // Restore local preview back to camera
    try {
      const s = localStreamRef.current;
      setLocalUrl(s && (s as any).toURL ? (s as any).toURL() : null);
    } catch {
      // ignore
    }

    setSharing(false);
  }, [swapOutgoingVideoTrack]);

  const startScreenShare = useCallback(async () => {
    if (!webrtc) return;
    if (callType !== "video") return;
    const md: any = (webrtc as any).mediaDevices;
    if (typeof md?.getDisplayMedia !== "function") {
      setShareUnsupported(true);
      setError("Screen share is not supported on this device/build.");
      return;
    }

    setError(null);
    setShareUnsupported(false);
    try {
      const constraints: any =
        Platform.OS === "android"
          ? {
              audio: false,
              video: {
                mandatory: {
                  minWidth: 720,
                  minHeight: 480,
                  minFrameRate: 15,
                  maxFrameRate: 30,
                },
              },
            }
          : { video: true, audio: false };

      const displayStream: any = await md.getDisplayMedia(constraints);
      screenStreamRef.current = displayStream;

      const displayTrack: any = (displayStream as any)?.getVideoTracks?.()?.[0] ?? null;
      if (!displayTrack) {
        throw new Error("Screen share track unavailable");
      }

      // Heuristic: some Android apps/windows are protected (FLAG_SECURE/DRM) and will appear black.
      // Also some devices report a muted track when capture failed.
      try {
        const settings = typeof displayTrack.getSettings === "function" ? displayTrack.getSettings() : ({} as any);
        const w = Number((settings as any)?.width ?? 0);
        const h = Number((settings as any)?.height ?? 0);
        if ((displayTrack as any).muted === true || (w === 0 && h === 0)) {
          setError(
            "Screen share started but the captured content appears blank. Some apps (banking/DRM/secure windows) cannot be recorded by Android and will show black.",
          );
        }
      } catch {
        // ignore
      }

      // Auto-stop when user ends screen share
      try {
        displayTrack.onended = () => {
          void stopScreenShare();
        };
      } catch {
        // ignore
      }

      const pc: any = await ensurePeerConnection();

      await swapOutgoingVideoTrack(displayTrack, displayStream);

      // Local preview should show the shared screen
      setLocalUrl((displayStream as any).toURL ? (displayStream as any).toURL() : null);
      setSharing(true);
    } catch (e) {
      setError(toErrorMessage(e));
      setSharing(false);
      try {
        const s = localStreamRef.current;
        setLocalUrl(s && (s as any).toURL ? (s as any).toURL() : null);
      } catch {
        // ignore
      }
    }
  }, [webrtc, callType, ensurePeerConnection, stopScreenShare, swapOutgoingVideoTrack]);

  const toggleScreenShare = useCallback(() => {
    if (sharing) {
      void stopScreenShare();
      return;
    }
    void startScreenShare();
  }, [sharing, startScreenShare, stopScreenShare]);

  const flushCandidates = useCallback(async () => {
    if (!webrtc) return;
    const pc = pcRef.current;
    if (!pc) return;
    if (!remoteDescSetRef.current) return;

    const pending = pendingCandidatesRef.current;
    pendingCandidatesRef.current = [];

    for (const c of pending) {
      try {
        await pc.addIceCandidate(new webrtc.RTCIceCandidate(c as any));
      } catch {
        continue;
      }
    }
  }, [webrtc]);

  const createAndSendOffer = useCallback(async () => {
    if (!socket) return;
    const pc = await ensurePeerConnection();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("call-signal", { callId, data: { type: "offer", sdp: String(offer.sdp ?? "") } });
  }, [socket, ensurePeerConnection, callId]);

  const handleSignal = useCallback(
    async (data: CallSignal) => {
      const pc = await ensurePeerConnection();

      if (data.type === "offer") {
        await pc.setRemoteDescription(new (webrtc as any).RTCSessionDescription({ type: "offer", sdp: data.sdp }));
        remoteDescSetRef.current = true;
        await flushCandidates();

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket?.emit("call-signal", { callId, data: { type: "answer", sdp: String(answer.sdp ?? "") } });
        return;
      }

      if (data.type === "answer") {
        await pc.setRemoteDescription(new (webrtc as any).RTCSessionDescription({ type: "answer", sdp: data.sdp }));
        remoteDescSetRef.current = true;
        await flushCandidates();
        return;
      }

      if (data.type === "candidate") {
        const c = data.candidate;
        if (!remoteDescSetRef.current) {
          pendingCandidatesRef.current.push(c);
          return;
        }
        try {
          await pc.addIceCandidate(new (webrtc as any).RTCIceCandidate(c as any));
        } catch {
          // ignore
        }
      }
    },
    [ensurePeerConnection, flushCandidates, socket, webrtc, callId],
  );

  useEffect(() => {
    if (!socket) return;

    const onSignal = (payload: any) => {
      if (String(payload?.callId ?? "") !== callId) return;
      const data = payload?.data;
      if (!isSignal(data)) return;
      void handleSignal(data);
    };

    socket.on("call-signal", onSignal);
    return () => {
      socket.off("call-signal", onSignal);
    };
  }, [socket, callId, handleSignal]);

  useEffect(() => {
    if (!callId) return;
    if (!activeCall || activeCall.callId !== callId) {
      // If user navigated here directly, just show UI; allow joining from banner.
    }
  }, [activeCall, callId]);

  useEffect(() => {
    if (!socket || socketStatus !== "connected") return;
    if (!webrtc) return;
    if (!activeCall || activeCall.callId !== callId) return;
    if (callStatus !== "active" && activeCall.direction === "incoming") return;

    setError(null);
    setBusy(true);
    void (async () => {
      try {
        await ensurePeerConnection();
        if (isInitiator) {
          await createAndSendOffer();
        }
      } catch (e) {
        setError(toErrorMessage(e));
      } finally {
        setBusy(false);
      }
    })();

    return () => {
      // keep connection until end
    };
  }, [socket, socketStatus, webrtc, callId, activeCall, callStatus, ensurePeerConnection, isInitiator, createAndSendOffer]);

  useEffect(() => {
    return () => {
      cleanup();
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
    parts.push(`webrtc: ${webrtc ? "ok" : "none"}`);
    parts.push(`remote: ${remoteUrl ? "yes" : "no"}`);
    parts.push(`local: ${localUrl ? "yes" : "no"}`);
    return parts.join("\n");
  }, [socketStatus, callStatus, callType, sharing, webrtc, remoteUrl, localUrl]);

  const onHangup = useCallback(() => {
    endCall();
    cleanup();
    router.back();
  }, [endCall, cleanup]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    try {
      const s = localStreamRef.current;
      s?.getAudioTracks()?.forEach((t: any) => {
        (t as any).enabled = !next;
      });
    } catch {
      // ignore
    }

    try {
      if (InCallManager && typeof InCallManager.setMicrophoneMute === "function") {
        InCallManager.setMicrophoneMute(Boolean(next));
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
        InCallManager.setForceSpeakerphoneOn(Boolean(next));
      }
    } catch {
      // ignore
    }
  }, [speaker]);

  const unavailable = !canUseWebrtc || !webrtc;

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
          <Text style={{ color: "rgba(255,255,255,0.7)", textAlign: "center" }}>{webrtcUnavailableMessage || "Use a development build to enable calls."}</Text>
        </View>
      ) : callType === "video" ? (
        <View style={{ flex: 1 }}>
          {remoteUrl && RTCViewComponent ? (
            <RTCViewComponent streamURL={remoteUrl} style={{ flex: 1 }} objectFit="cover" />
          ) : (
            <View style={{ flex: 1, backgroundColor: "#111" }} />
          )}
          {localUrl ? (
            <View style={{ position: "absolute", right: 12, top: 90, width: 110, height: 160, borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" }}>
              {RTCViewComponent ? <RTCViewComponent streamURL={localUrl} style={{ width: "100%", height: "100%" }} objectFit="cover" /> : null}
            </View>
          ) : null}
        </View>
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
        {callType === "video" && canShareScreen ? (
          <Pressable
            onPress={toggleScreenShare}
            disabled={busy || shareUnsupported}
            style={({ pressed }) => ({
              flex: 1,
              paddingVertical: 12,
              borderRadius: 999,
              backgroundColor: busy || shareUnsupported ? "rgba(255,255,255,0.06)" : pressed ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.12)",
              alignItems: "center",
            })}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, opacity: busy || shareUnsupported ? 0.6 : 1 }}>
              <Ionicons name={sharing ? "stop-circle" : "phone-portrait-outline"} size={18} color="white" />
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

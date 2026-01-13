import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Share, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../utils/colors";
import { PremiumModal } from "../../components/PremiumModal";
import { PremiumScreen } from "../../components/PremiumScreen";
import { FadeIn } from "../../components/FadeIn";
import { Skeleton } from "../../components/Skeleton";
import { TypingDots } from "../../components/TypingDots";
import type { ChannelDto } from "../../types";
import { aiChat, aiChatStream, type AiProvider } from "../../services/ai";
import { listChannels } from "../../services/channels";
import { createMessage } from "../../services/messages";
import { getItem, getJson, removeItem, setItem, setJson } from "../../services/storage";
import { getActiveWorkspaceId } from "../../services/workspaceSelection";
import { uploadFile } from "../../services/files";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type CachedAiConversation = {
  version: 1;
  provider: AiProvider;
  model: string;
  streaming: boolean;
  messages: ChatMessage[];
  updatedAt: string;
};

const CACHE_KEY = "cipher.ai.conversation.v1";
const LAST_SHARE_CHANNEL_KEY = "cipher.ai.lastShareChannelId";

const MAX_PROMPT_CHARS = 12000;
const MAX_EMBED_TOTAL_CHARS = 20000;
const MAX_EMBED_PER_FILE_CHARS = 12000;

let Clipboard: any;
try {
  Clipboard = require("expo-clipboard");
} catch {
  Clipboard = null;
}

let FileSystem: any;
try {
  FileSystem = require("expo-file-system");
} catch {
  FileSystem = null;
}

let Sharing: any;
try {
  Sharing = require("expo-sharing");
} catch {
  Sharing = null;
}

function toErrorMessage(error: unknown): string {
  return typeof (error as any)?.message === "string" ? String((error as any).message) : "Request failed";
}

function normalizeForShare(text: string): string {
  const content = text.trim();
  const prefixed = `Cipher AI:\n\n${content}`.trim();
  if (prefixed.length <= 8000) return prefixed;
  return `${prefixed.slice(0, 7990)}...`;
}

function parseAiAttachmentsFromMessage(content: string): {
  main: string;
  attachments: { kind: "image" | "document"; name: string; url: string }[];
} {
  const raw = String(content ?? "");
  const marker = "\n\nAttachments:\n";
  const idx = raw.indexOf(marker);
  if (idx === -1) return { main: raw, attachments: [] };

  const main = raw.slice(0, idx).trimEnd();
  const tail = raw.slice(idx + marker.length);
  const lines = tail.split("\n");

  const out: { kind: "image" | "document"; name: string; url: string }[] = [];
  for (const line of lines) {
    const l = line.trim();
    if (!l.startsWith("- ")) continue;
    const rest = l.slice(2);
    const parts = rest.split(": ");
    if (parts.length < 2) continue;
    const label = parts.slice(0, -1).join(": ").trim();
    const url = parts[parts.length - 1].trim();
    if (!url.startsWith("http")) continue;

    const isImage = label.toLowerCase().startsWith("image");
    const kind: "image" | "document" = isImage ? "image" : "document";
    const m = label.match(/\((.+)\)/);
    const name = (m?.[1] ?? label).trim();
    out.push({ kind, name, url });
  }

  return { main, attachments: out };
}

export default function AiScreen(): JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [provider, setProvider] = useState<AiProvider>("openai");
  const [model, setModel] = useState<string>("");
  const [streaming, setStreaming] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [shareOpen, setShareOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareChannels, setShareChannels] = useState<ChannelDto[]>([]);
  const [shareTarget, setShareTarget] = useState<ChatMessage | null>(null);
  const [lastShareChannelId, setLastShareChannelId] = useState<string>("");

  const [selectionMode, setSelectionMode] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});

  const [quickOpen, setQuickOpen] = useState<boolean>(false);
  const [quickTarget, setQuickTarget] = useState<ChatMessage | null>(null);

  const [previewOpen, setPreviewOpen] = useState<boolean>(false);
  const [previewItem, setPreviewItem] = useState<
    { uri: string; name: string; kind: "image" | "document"; mimeType: string } | null
  >(null);

  const [uploadStatus, setUploadStatus] = useState<{ total: number; index: number; name: string } | null>(null);

  const [attachmentsOpen, setAttachmentsOpen] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [pendingAttachments, setPendingAttachments] = useState<
    { key: string; uri: string; name: string; mimeType: string; kind: "image" | "document" }[]
  >([]);

  const restoreConversation = useCallback(async () => {
    try {
      const cached = await getJson<CachedAiConversation>(CACHE_KEY);
      if (!cached || cached.version !== 1) return;

      if (cached.provider === "openai" || cached.provider === "grok") {
        setProvider(cached.provider);
      }

      if (typeof cached.model === "string") {
        setModel(cached.model);
      }

      if (typeof cached.streaming === "boolean") {
        setStreaming(cached.streaming);
      }

      if (Array.isArray(cached.messages)) {
        const safe = cached.messages
          .filter(
            (m) =>
              m &&
              typeof (m as any).id === "string" &&
              ((m as any).role === "user" || (m as any).role === "assistant") &&
              typeof (m as any).content === "string"
          )
          .slice(-80) as ChatMessage[];
        setMessages(safe);
      }

      const last = await getItem(LAST_SHARE_CHANNEL_KEY);
      if (typeof last === "string" && last) {
        setLastShareChannelId(last);
      }
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    void restoreConversation();
  }, [restoreConversation]);

  const persistConversation = useCallback(async () => {
    const payload: CachedAiConversation = {
      version: 1,
      provider,
      model,
      streaming,
      messages: messages.slice(-80),
      updatedAt: new Date().toISOString(),
    };

    try {
      await setJson(CACHE_KEY, payload);
    } catch {
      return;
    }
  }, [messages, model, provider, streaming]);

  useEffect(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      void persistConversation();
    }, 500);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [persistConversation]);

  const canSend = useMemo(() => text.trim().length > 0 && !busy, [busy, text]);
  const canAttach = useMemo(() => !busy && !uploading, [busy, uploading]);

  const promptLen = useMemo(() => text.trim().length, [text]);
  const promptOverLimit = promptLen > MAX_PROMPT_CHARS;

  const selectedCount = useMemo(() => Object.values(selectedIds).filter(Boolean).length, [selectedIds]);

  const clearSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds({});
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const selectedMessages = useMemo(() => {
    const ids = new Set(Object.entries(selectedIds).filter(([, v]) => !!v).map(([k]) => k));
    return messages.filter((m) => ids.has(m.id));
  }, [messages, selectedIds]);

  const selectedText = useMemo(() => {
    const parts: string[] = [];
    for (const m of selectedMessages) {
      const role = m.role === "assistant" ? "AI" : "You";
      const content = (m.content ?? "").trim();
      if (!content) continue;
      parts.push(`${role}: ${content}`);
    }
    return parts.join("\n\n");
  }, [selectedMessages]);

  const selectAll = useCallback(() => {
    setSelectedIds(() => {
      const next: Record<string, boolean> = {};
      for (const m of messages) {
        const canSelect = !!m.content.trim() || m.role === "user";
        if (!canSelect) continue;
        next[m.id] = true;
      }
      return next;
    });
  }, [messages]);

  const shareSelectedExternally = useCallback(async () => {
    if (!selectedText.trim()) return;
    try {
      await Share.share({ message: selectedText });
      clearSelection();
    } catch {
      setError("Failed to share");
    }
  }, [clearSelection, selectedText]);

  const copySelected = useCallback(async () => {
    if (!selectedText.trim()) return;
    if (!Clipboard?.setStringAsync) {
      setError("Clipboard is not available in this build");
      return;
    }
    try {
      await Clipboard.setStringAsync(selectedText);
      clearSelection();
    } catch {
      setError("Failed to copy");
    }
  }, [clearSelection, selectedText]);

  const removePendingAttachment = useCallback((key: string) => {
    setPendingAttachments((prev) => prev.filter((x) => x.key !== key));
  }, []);

  const pickImage = useCallback(async (fromCamera: boolean) => {
    if (!canAttach) return;
    try {
      let result: any;
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setError("Camera permission is required");
          return;
        }
        result = await ImagePicker.launchCameraAsync({ quality: 0.9 });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          setError("Gallery permission is required");
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({ quality: 0.9, allowsMultipleSelection: true, selectionLimit: 10 } as any);
      }

      if (!result || (result as any).canceled) return;
      const assets: any[] = Array.isArray((result as any).assets) ? (result as any).assets : [];
      if (assets.length === 0) return;

      setPendingAttachments((prev) => {
        const next = [...prev];
        for (const a of assets) {
          const uri = String(a?.uri ?? "");
          if (!uri) continue;
          const fileName = String(a?.fileName ?? `image-${Date.now()}.jpg`);
          const mimeType = String(a?.mimeType ?? "image/jpeg");
          next.push({ key: `img:${uri}`, uri, name: fileName, mimeType, kind: "image" });
        }
        return next;
      });
      setAttachmentsOpen(false);
    } catch (e) {
      setError(toErrorMessage(e));
    }
  }, [canAttach]);

  const pickDocument = useCallback(async () => {
    if (!canAttach) return;
    try {
      const res: any = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (!res) return;

      if (res.type === "success") {
        // legacy single
        const uri = String(res.uri ?? "");
        if (!uri) return;
        setPendingAttachments((prev) => [
          ...prev,
          {
            key: `doc:${uri}`,
            uri,
            name: String(res.name ?? `file-${Date.now()}`),
            mimeType: String(res.mimeType ?? "application/octet-stream"),
            kind: "document",
          },
        ]);
        setAttachmentsOpen(false);
        return;
      }

      const assets: any[] = Array.isArray(res.assets) ? res.assets : [];
      if (assets.length === 0) return;
      setPendingAttachments((prev) => {
        const next = [...prev];
        for (const a of assets) {
          const uri = String(a?.uri ?? "");
          if (!uri) continue;
          next.push({
            key: `doc:${uri}`,
            uri,
            name: String(a?.name ?? `file-${Date.now()}`),
            mimeType: String(a?.mimeType ?? "application/octet-stream"),
            kind: "document",
          });
        }
        return next;
      });
      setAttachmentsOpen(false);
    } catch (e) {
      setError(toErrorMessage(e));
    }
  }, [canAttach]);

  const tryReadTextFile = useCallback(async (uri: string, mimeType: string): Promise<string | null> => {
    const mt = String(mimeType ?? "").toLowerCase();
    const looksText = mt.includes("text/") || mt.includes("application/json") || mt.includes("application/xml") || mt.includes("application/javascript");
    if (!looksText) return null;

    try {
      if (Platform.OS === "web") {
        const resp = await fetch(uri);
        const text = await resp.text();
        if (!text) return null;
        return text;
      }
      if (FileSystem?.readAsStringAsync) {
        const text = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
        return text || null;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const uploadAndFormatAttachments = useCallback(async (): Promise<{ appendix: string; hadAny: boolean }> => {
    if (pendingAttachments.length === 0) return { appendix: "", hadAny: false };
    setUploading(true);
    try {
      const uploaded: { url: string; type: string; name?: string; size?: number; kind: "image" | "document"; mimeType: string; localUri: string }[] = [];
      const total = pendingAttachments.length;
      for (let i = 0; i < pendingAttachments.length; i += 1) {
        const it = pendingAttachments[i];
        setUploadStatus({ total, index: i + 1, name: it.name });
        const res = await uploadFile({ uri: it.uri, name: it.name, mimeType: it.mimeType, kind: it.kind });
        uploaded.push({ url: res.url, type: res.type, name: res.name, size: res.size, kind: it.kind, mimeType: it.mimeType, localUri: it.uri });
      }
      setPendingAttachments([]);

      const lines: string[] = [];
      lines.push("\n\nAttachments:\n");
      let embeddedTotal = 0;
      for (const u of uploaded) {
        const label = u.kind === "image" ? "Image" : "File";
        const name = u.name ? ` (${u.name})` : "";
        lines.push(`- ${label}${name}: ${u.url}`);

        if (u.kind === "image") {
          lines.push(`  Instruction: Please describe this image and extract any relevant information.`);
          continue;
        }

        if (embeddedTotal >= MAX_EMBED_TOTAL_CHARS) continue;

        const raw = await tryReadTextFile(u.localUri, u.mimeType);
        if (!raw) continue;

        const clippedPerFile = raw.length > MAX_EMBED_PER_FILE_CHARS ? `${raw.slice(0, MAX_EMBED_PER_FILE_CHARS)}\n...` : raw;
        const remaining = Math.max(0, MAX_EMBED_TOTAL_CHARS - embeddedTotal);
        const finalText = clippedPerFile.length > remaining ? `${clippedPerFile.slice(0, remaining)}\n...` : clippedPerFile;
        embeddedTotal += finalText.length;

        lines.push("  Embedded content (truncated if large):");
        lines.push("  ```\n" + finalText + "\n  ```");
      }

      if (embeddedTotal >= MAX_EMBED_TOTAL_CHARS) {
        lines.push(`\nNote: Embedded file content was truncated to ${MAX_EMBED_TOTAL_CHARS} characters total.`);
      }

      return { appendix: lines.join("\n"), hadAny: true };
    } finally {
      setUploadStatus(null);
      setUploading(false);
    }
  }, [pendingAttachments, tryReadTextFile]);

  const downloadSelected = useCallback(async () => {
    if (!selectedText.trim()) return;
    if (!FileSystem?.documentDirectory || !FileSystem?.writeAsStringAsync) {
      setError("Downloads are not available in this build");
      return;
    }

    try {
      const filename = `cipher-ai-${Date.now()}.txt`;
      const path = `${FileSystem.documentDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(path, selectedText, { encoding: FileSystem.EncodingType.UTF8 });

      if (Sharing?.isAvailableAsync && Sharing?.shareAsync) {
        const can = await Sharing.isAvailableAsync();
        if (can) {
          await Sharing.shareAsync(path);
        }
      }
      clearSelection();
    } catch {
      setError("Failed to save");
    }
  }, [clearSelection, selectedText]);

  const newConversation = useCallback(() => {
    setBusy(false);
    setError(null);
    setMessages([]);
    void removeItem(CACHE_KEY);
  }, []);

  const openShare = useCallback((message: ChatMessage) => {
    if (!message.content.trim()) {
      setError("Nothing to share yet");
      return;
    }

    setShareTarget(message);
    setShareError(null);
    setShareChannels([]);
    setShareOpen(true);
  }, []);

  const loadShareChannels = useCallback(async () => {
    setShareBusy(true);
    setShareError(null);

    try {
      const workspaceId = await getActiveWorkspaceId();
      if (!workspaceId) {
        throw new Error("Select a workspace in Chat first");
      }

      const channels = await listChannels(workspaceId);
      setShareChannels(channels);
    } catch (e) {
      setShareError(toErrorMessage(e));
    } finally {
      setShareBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!shareOpen) return;
    void loadShareChannels();
  }, [loadShareChannels, shareOpen]);

  const shareToChannel = useCallback(
    async (channel: ChannelDto) => {
      if (!shareTarget) return;

      setShareBusy(true);
      setShareError(null);

      try {
        await createMessage({ channelId: channel._id, text: normalizeForShare(shareTarget.content) });
        await setItem(LAST_SHARE_CHANNEL_KEY, channel._id);
        setLastShareChannelId(channel._id);

        setShareOpen(false);
        setShareTarget(null);

        router.push(`/(app)/chat/${channel._id}?name=${encodeURIComponent(channel.name)}`);
      } catch (e) {
        setShareError(toErrorMessage(e));
      } finally {
        setShareBusy(false);
      }
    },
    [shareTarget]
  );

  const send = useCallback(async () => {
    const value = text.trim();
    if (!value) return;
    if (busy) return;

    if (uploading) return;

    if (value.length > MAX_PROMPT_CHARS) {
      setError(`Message is too long (${value.length}/${MAX_PROMPT_CHARS}).`);
      return;
    }

    setError(null);
    setBusy(true);

    const now = Date.now();
    let composed = value;
    try {
      const att = await uploadAndFormatAttachments();
      if (att.hadAny && att.appendix) {
        composed = `${value}${att.appendix}`;
      }
    } catch (e) {
      setError(toErrorMessage(e));
    }

    if (composed.length > MAX_PROMPT_CHARS) {
      setError(`Message + attachments is too long (${composed.length}/${MAX_PROMPT_CHARS}). Remove some content and try again.`);
      setBusy(false);
      return;
    }

    const nextUser: ChatMessage = { id: `u-${now}`, role: "user", content: composed };
    const assistantId = `a-${now}`;
    const nextAi: ChatMessage = { id: assistantId, role: "assistant", content: "" };

    setMessages((prev) => [...prev, nextUser, nextAi]);
    setText("");

    const modelTrimmed = model.trim();
    const requestMessages = [...messages, nextUser].map((m) => ({ role: m.role as any, content: m.content }));

    try {
      if (streaming) {
        let content = "";
        await aiChatStream({
          request: {
            provider,
            model: modelTrimmed ? modelTrimmed : undefined,
            messages: requestMessages,
          },
          onEvent: (event) => {
            if (event.type === "delta") {
              content += event.delta;
              setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content } : m)));
              return;
            }

            if (event.type === "error") {
              setError(event.message);
            }
          },
        });
      } else {
        const res = await aiChat({
          provider,
          model: modelTrimmed ? modelTrimmed : undefined,
          messages: requestMessages,
        });

        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: res.message.content } : m)));
      }
    } catch (e) {
      setError(toErrorMessage(e));
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: "" } : m)));
    } finally {
      setBusy(false);
    }
  }, [busy, messages, model, provider, streaming, text, uploadAndFormatAttachments, uploading]);

  const quickCopy = useCallback(async () => {
    const content = (quickTarget?.content ?? "").trim();
    if (!content) return;
    if (!Clipboard?.setStringAsync) {
      setError("Clipboard is not available in this build");
      return;
    }
    try {
      await Clipboard.setStringAsync(content);
    } catch {
      setError("Failed to copy");
    } finally {
      setQuickOpen(false);
      setQuickTarget(null);
    }
  }, [quickTarget]);

  const quickDownload = useCallback(async () => {
    const content = (quickTarget?.content ?? "").trim();
    if (!content) return;
    if (!FileSystem?.documentDirectory || !FileSystem?.writeAsStringAsync) {
      setError("Downloads are not available in this build");
      return;
    }
    try {
      const filename = `cipher-ai-${Date.now()}.txt`;
      const path = `${FileSystem.documentDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(path, content, { encoding: FileSystem.EncodingType.UTF8 });
      if (Sharing?.isAvailableAsync && Sharing?.shareAsync) {
        const can = await Sharing.isAvailableAsync();
        if (can) {
          await Sharing.shareAsync(path);
        }
      }
    } catch {
      setError("Failed to save");
    } finally {
      setQuickOpen(false);
      setQuickTarget(null);
    }
  }, [quickTarget]);

  const quickShareToChannel = useCallback(() => {
    if (!quickTarget) return;
    setQuickOpen(false);
    openShare(quickTarget);
    setQuickTarget(null);
  }, [openShare, quickTarget]);

  const quickSelect = useCallback(() => {
    if (!quickTarget) return;
    setSelectionMode(true);
    setSelectedIds((prev) => ({ ...prev, [quickTarget.id]: true }));
    setQuickOpen(false);
    setQuickTarget(null);
  }, [quickTarget]);

  return (
    <PremiumScreen padded={false} topPadding={0}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <View
          style={{
            paddingTop: 56,
            paddingHorizontal: 16,
            paddingBottom: 14,
            borderBottomWidth: 1,
            borderBottomColor: "rgba(255,255,255,0.07)",
            backgroundColor: "rgba(0,0,0,0.14)",
          }}
        >
          <View className="flex-row items-center justify-between">
            {selectionMode ? (
              <View className="flex-row items-center" style={{ gap: 10 }}>
                <Pressable onPress={clearSelection} style={({ pressed }) => ({ padding: 8, opacity: pressed ? 0.7 : 1 })}>
                  <Ionicons name="close" size={22} color="white" />
                </Pressable>
                <Text className="text-base font-semibold text-white">{selectedCount} selected</Text>
              </View>
            ) : (
              <View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Text className="text-xl font-semibold text-white">Cipher AI</Text>
                  <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(16,185,129,0.18)", borderWidth: 1, borderColor: "rgba(16,185,129,0.25)" }}>
                    <Text style={{ color: "rgba(16,185,129,1)", fontWeight: "900", fontSize: 12 }}>Premium</Text>
                  </View>
                </View>
                <Text style={{ color: "rgba(255,255,255,0.7)", marginTop: 4, fontSize: 12 }}>
                  Ask anything. Attach files. Share to channels.
                </Text>
              </View>
            )}

            <View className="flex-row items-center" style={{ gap: 10 }}>
              {selectionMode ? (
                <>
                  <Pressable
                    onPress={() => {
                      selectAll();
                    }}
                    style={({ pressed }) => ({ padding: 8, opacity: pressed ? 0.7 : 1 })}
                  >
                    <Ionicons name="checkbox-outline" size={20} color="white" />
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      void copySelected();
                    }}
                    style={({ pressed }) => ({ padding: 8, opacity: pressed ? 0.7 : selectedCount ? 1 : 0.35 })}
                    disabled={!selectedCount}
                  >
                    <Ionicons name="copy-outline" size={20} color="white" />
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      void downloadSelected();
                    }}
                    style={({ pressed }) => ({ padding: 8, opacity: pressed ? 0.7 : selectedCount ? 1 : 0.35 })}
                    disabled={!selectedCount}
                  >
                    <Ionicons name="download-outline" size={20} color="white" />
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      if (!selectedCount) return;
                      void shareSelectedExternally();
                    }}
                    style={({ pressed }) => ({ padding: 8, opacity: pressed ? 0.7 : selectedCount ? 1 : 0.35 })}
                    disabled={!selectedCount}
                  >
                    <Ionicons name="share-social-outline" size={20} color="white" />
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable
                    onPress={() => {
                      setSelectionMode(true);
                    }}
                    style={({ pressed }) => ({ padding: 8, opacity: pressed ? 0.7 : 1 })}
                  >
                    <Ionicons name="checkmark-circle-outline" size={20} color="white" />
                  </Pressable>

                  {messages.some((m) => m.role === "assistant" && m.content.trim().length > 0) ? (
                    <Pressable
                      onPress={() => {
                        const latest = [...messages].reverse().find((m) => m.role === "assistant" && m.content.trim().length > 0) ?? null;
                        if (latest) {
                          openShare(latest);
                        } else {
                          setError("Nothing to share yet");
                        }
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Share to channel"
                      style={({ pressed }) => ({ padding: 8, opacity: pressed ? 0.7 : 1 })}
                    >
                      <Ionicons name="share-outline" size={20} color="white" />
                    </Pressable>
                  ) : null}

                  <Pressable onPress={newConversation} accessibilityRole="button" accessibilityLabel="New conversation" style={({ pressed }) => ({ padding: 8, opacity: pressed ? 0.7 : 1 })}>
                    <Ionicons name="add" size={22} color="white" />
                  </Pressable>
                </>
              )}
            </View>
          </View>

          <View className="mt-3 flex-row items-center" style={{ gap: 10, flexWrap: "wrap" }}>
            <Pressable
              onPress={() => setProvider("openai")}
              className="mr-2 rounded-full px-3 py-1"
              style={{ backgroundColor: provider === "openai" ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.08)" }}
              accessibilityRole="button"
              accessibilityLabel="Use OpenAI"
            >
              <Text className="text-white" style={{ opacity: 0.95 }}>
                OpenAI
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setProvider("grok")}
              className="rounded-full px-3 py-1"
              style={{ backgroundColor: provider === "grok" ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.08)" }}
              accessibilityRole="button"
              accessibilityLabel="Use Grok"
            >
              <Text className="text-white" style={{ opacity: 0.95 }}>
                Grok
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setStreaming((v) => !v)}
              className="rounded-full px-3 py-1"
              style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
              accessibilityRole="button"
              accessibilityLabel="Toggle streaming"
            >
              <Text className="text-white" style={{ opacity: 0.95 }}>
                {streaming ? "Streaming" : "No stream"}
              </Text>
            </Pressable>
          </View>

          <View className="mt-3 rounded-2xl px-4" style={{ backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
            <TextInput
              value={model}
              onChangeText={setModel}
              placeholder={provider === "openai" ? "Model (default gpt-4o-mini)" : "Model (default grok-2-latest)"}
              placeholderTextColor="rgba(255,255,255,0.6)"
              autoCapitalize="none"
              className="h-11 text-white"
            />
          </View>

          {error ? (
            <View className="mt-3">
              <Text className="text-white" style={{ opacity: 0.9 }}>
                {error}
              </Text>
            </View>
          ) : null}

          {busy ? (
            <View style={{ marginTop: 10, alignItems: "flex-start" }}>
              <View
                style={{
                  borderRadius: 18,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  backgroundColor: "rgba(11,20,26,0.88)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                }}
              >
                <TypingDots color="rgba(255,255,255,0.85)" />
              </View>
            </View>
          ) : null}
        </View>

        <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 24 }}>
          {messages.length === 0 ? (
            <View className="mt-10">
              {busy ? (
                <View>
                  <Skeleton height={18} width={"55%"} radius={10} />
                  <View className="mt-4">
                    <Skeleton height={44} radius={18} />
                    <View className="mt-3">
                      <Skeleton height={44} radius={18} />
                    </View>
                    <View className="mt-3">
                      <Skeleton height={44} radius={18} />
                    </View>
                  </View>
                </View>
              ) : (
                <Text className="text-white" style={{ opacity: 0.9 }}>
                  Try a prompt template:
                </Text>
              )}
              <View className="mt-4">
                {[
                  "Summarize workspace",
                  "Code review assistant",
                  "Generate code",
                  "Explain concept",
                  "Create documentation",
                ].map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => setText(p)}
                    className="mt-3 rounded-2xl px-4 py-3"
                    style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
                    accessibilityRole="button"
                    accessibilityLabel={`Use template ${p}`}
                  >
                    <Text className="text-white" style={{ opacity: 0.95 }}>
                      {p}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            <View className="pt-2">
              {messages.map((m) => {
                const isSelected = !!selectedIds[m.id];
                const canSelect = !!m.content.trim() || m.role === "user";
                const parsed = parseAiAttachmentsFromMessage(m.content);
                return (
                  <FadeIn key={m.id}>
                    <View className={m.role === "user" ? "items-end" : "items-start"}>
                      <Pressable
                        onLongPress={() => {
                          if (!canSelect) return;
                          if (selectionMode) {
                            toggleSelected(m.id);
                            return;
                          }
                          setQuickTarget(m);
                          setQuickOpen(true);
                        }}
                        delayLongPress={240}
                        onPress={() => {
                          if (!selectionMode) return;
                          if (!canSelect) return;
                          toggleSelected(m.id);
                        }}
                        style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
                      >
                        {m.role === "user" ? (
                          <LinearGradient
                            colors={["#5865F2", "#0EA5E9"]}
                            start={{ x: 0.0, y: 0.2 }}
                            end={{ x: 1, y: 1 }}
                            style={{
                              marginTop: 12,
                              maxWidth: "85%",
                              borderRadius: 18,
                              paddingHorizontal: 14,
                              paddingVertical: 12,
                              borderWidth: isSelected ? 2 : 1,
                              borderColor: isSelected ? "rgba(37,211,102,0.9)" : "rgba(255,255,255,0.10)",
                            }}
                          >
                            {parsed.main ? <Text style={{ color: "white", lineHeight: 20 }}>{parsed.main}</Text> : null}
                            {parsed.attachments.length > 0 ? (
                              <View style={{ marginTop: 10, gap: 10 }}>
                                {parsed.attachments.map((a, idx) => (
                                  <Pressable
                                    key={`${a.url}_${idx}`}
                                    onPress={() => {
                                      setPreviewItem({ uri: a.url, name: a.name, kind: a.kind, mimeType: a.kind === "image" ? "image" : "document" });
                                      setPreviewOpen(true);
                                    }}
                                    style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
                                  >
                                    {a.kind === "image" ? (
                                      <Image source={{ uri: a.url }} style={{ width: 220, height: 160, borderRadius: 14 }} />
                                    ) : (
                                      <View style={{ padding: 12, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.22)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" }}>
                                        <Text style={{ color: "white", fontWeight: "800" }} numberOfLines={1}>
                                          {a.name}
                                        </Text>
                                        <Text style={{ color: "rgba(255,255,255,0.8)", marginTop: 6, fontSize: 12 }}>Tap to open</Text>
                                      </View>
                                    )}
                                  </Pressable>
                                ))}
                              </View>
                            ) : null}
                          </LinearGradient>
                        ) : (
                          <View
                            style={{
                              marginTop: 12,
                              maxWidth: "85%",
                              borderRadius: 18,
                              paddingHorizontal: 14,
                              paddingVertical: 12,
                              backgroundColor: "rgba(11,20,26,0.88)",
                              borderWidth: isSelected ? 2 : 1,
                              borderColor: isSelected ? "rgba(37,211,102,0.9)" : "rgba(255,255,255,0.08)",
                            }}
                          >
                            {parsed.main ? (
                              <Text style={{ color: "white", lineHeight: 20 }}>{parsed.main}</Text>
                            ) : m.role === "assistant" && busy ? (
                              <TypingDots color="rgba(255,255,255,0.85)" />
                            ) : (
                              <Text style={{ color: "white" }}></Text>
                            )}
                            {parsed.attachments.length > 0 ? (
                              <View style={{ marginTop: 10, gap: 10 }}>
                                {parsed.attachments.map((a, idx) => (
                                  <Pressable
                                    key={`${a.url}_${idx}`}
                                    onPress={() => {
                                      setPreviewItem({ uri: a.url, name: a.name, kind: a.kind, mimeType: a.kind === "image" ? "image" : "document" });
                                      setPreviewOpen(true);
                                    }}
                                    style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
                                  >
                                    {a.kind === "image" ? (
                                      <Image source={{ uri: a.url }} style={{ width: 220, height: 160, borderRadius: 14 }} />
                                    ) : (
                                      <View style={{ padding: 12, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
                                        <Text style={{ color: Colors.dark.textPrimary, fontWeight: "800" }} numberOfLines={1}>
                                          {a.name}
                                        </Text>
                                        <Text style={{ color: Colors.dark.textSecondary, marginTop: 6, fontSize: 12 }}>Tap to open</Text>
                                      </View>
                                    )}
                                  </Pressable>
                                ))}
                              </View>
                            ) : null}
                          </View>
                        )}
                      </Pressable>

                      {!selectionMode && m.role === "assistant" && m.content.trim().length > 0 ? (
                        <Pressable
                          onPress={() => openShare(m)}
                          className="mt-1"
                          accessibilityRole="button"
                          accessibilityLabel="Share message to channel"
                          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                        >
                          <Text className="text-white" style={{ opacity: 0.8, fontSize: 12 }}>
                            Share to channel
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </FadeIn>
                );
              })}
            </View>
          )}
        </ScrollView>

        <View className="px-4 pb-8">
          {pendingAttachments.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10, gap: 10 }}>
              {pendingAttachments.map((a) => (
                <Pressable
                  key={a.key}
                  onPress={() => {
                    setPreviewItem({ uri: a.uri, name: a.name, kind: a.kind, mimeType: a.mimeType });
                    setPreviewOpen(true);
                  }}
                  style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
                >
                  <View
                    style={{
                      width: 78,
                      height: 78,
                      borderRadius: 14,
                      overflow: "hidden",
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.10)",
                      backgroundColor: "rgba(255,255,255,0.06)",
                    }}
                  >
                    {a.kind === "image" ? (
                      <Image source={{ uri: a.uri }} style={{ width: "100%", height: "100%" }} />
                    ) : (
                      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 8 }}>
                        <Ionicons name="document-text-outline" size={22} color="white" />
                        <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 10, marginTop: 6 }} numberOfLines={2}>
                          {a.name}
                        </Text>
                      </View>
                    )}
                    <Pressable
                      onPress={() => removePendingAttachment(a.key)}
                      style={({ pressed }) => ({ position: "absolute", top: 6, right: 6, opacity: pressed ? 0.7 : 1, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 999, padding: 4 })}
                    >
                      <Ionicons name="close" size={14} color="white" />
                    </Pressable>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          <View
            className="flex-row items-center rounded-3xl px-4"
            style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
          >
            <Pressable
              onPress={() => {
                if (!canAttach) return;
                setAttachmentsOpen(true);
              }}
              style={({ pressed }) => ({ paddingRight: 10, opacity: pressed ? 0.7 : canAttach ? 1 : 0.35 })}
              disabled={!canAttach}
            >
              <Ionicons name="attach" size={20} color="white" />
            </Pressable>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Message Cipher AI"
              placeholderTextColor="rgba(255,255,255,0.6)"
              className="h-12 flex-1 text-white"
            />
            <Pressable
              onPress={() => {
                if (!canSend) return;
                if (promptOverLimit) return;
                void send();
              }}
              disabled={!canSend || uploading || promptOverLimit}
              className="h-10 w-10 items-center justify-center rounded-full"
              style={{ backgroundColor: canSend && !uploading && !promptOverLimit ? Colors.aiGreen : "rgba(255,255,255,0.2)" }}
              accessibilityRole="button"
              accessibilityLabel="Send"
            >
              <Text className="text-white">➤</Text>
            </Pressable>
          </View>

          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
            <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }}>
              {uploadStatus
                ? `Uploading ${uploadStatus.index}/${uploadStatus.total}: ${uploadStatus.name}`
                : uploading
                  ? "Uploading attachments…"
                  : pendingAttachments.length > 0
                    ? `${pendingAttachments.length} attachment(s) ready`
                    : ""}
            </Text>
          </View>
        </View>

        <PremiumModal
          visible={quickOpen}
          title={quickTarget?.role === "assistant" ? "AI message" : "Your message"}
          canClose
          presentation="bottom"
          onClose={() => {
            setQuickOpen(false);
            setQuickTarget(null);
          }}
        >
          <Text style={{ color: Colors.dark.textSecondary, marginTop: 2 }} numberOfLines={2}>
            {(quickTarget?.content ?? "").trim() || "(empty)"}
          </Text>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <Pressable
              onPress={() => void quickCopy()}
              style={({ pressed }) => ({ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 999, backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.08)" })}
            >
              <Text style={{ color: Colors.dark.textPrimary, fontWeight: "800" }}>Copy</Text>
            </Pressable>
            <Pressable
              onPress={() => quickShareToChannel()}
              style={({ pressed }) => ({ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 999, backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.08)" })}
            >
              <Text style={{ color: Colors.dark.textPrimary, fontWeight: "800" }}>Share</Text>
            </Pressable>
            <Pressable
              onPress={() => void quickDownload()}
              style={({ pressed }) => ({ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 999, backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.08)" })}
            >
              <Text style={{ color: Colors.dark.textPrimary, fontWeight: "800" }}>Download</Text>
            </Pressable>
            <Pressable
              onPress={() => quickSelect()}
              style={({ pressed }) => ({ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 999, backgroundColor: pressed ? "rgba(37,211,102,0.22)" : "rgba(37,211,102,0.14)" })}
            >
              <Text style={{ color: Colors.dark.textPrimary, fontWeight: "800" }}>Select</Text>
            </Pressable>
          </View>
        </PremiumModal>

        <Modal transparent visible={previewOpen} animationType="fade" onRequestClose={() => setPreviewOpen(false)}>
          <Pressable
            onPress={() => {
              setPreviewOpen(false);
              setPreviewItem(null);
            }}
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", paddingHorizontal: 14 }}
          >
            <Pressable onPress={() => {}} style={{ backgroundColor: "#0b141a", borderRadius: 16, padding: 14 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900" }} numberOfLines={1}>
                  {previewItem?.name ?? "Preview"}
                </Text>
                <Pressable
                  onPress={() => {
                    setPreviewOpen(false);
                    setPreviewItem(null);
                  }}
                  style={({ pressed }) => ({ padding: 8, opacity: pressed ? 0.7 : 1 })}
                >
                  <Ionicons name="close" size={20} color={Colors.dark.textPrimary} />
                </Pressable>
              </View>

              {previewItem?.kind === "image" ? (
                <Image source={{ uri: previewItem.uri }} style={{ width: "100%", height: 320, borderRadius: 14, marginTop: 12 }} resizeMode="cover" />
              ) : (
                <View style={{ marginTop: 12, padding: 14, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.06)" }}>
                  <Text style={{ color: Colors.dark.textPrimary, fontWeight: "800" }}>{previewItem?.name ?? "Document"}</Text>
                  <Text style={{ color: Colors.dark.textSecondary, marginTop: 6 }} numberOfLines={2}>
                    {previewItem?.mimeType ?? ""}
                  </Text>
                </View>
              )}

              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
                <Pressable
                  onPress={() => {
                    const uri = previewItem?.uri ?? "";
                    if (!uri) return;
                    void Linking.openURL(uri);
                  }}
                  style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.08)" })}
                >
                  <Text style={{ color: Colors.dark.textPrimary, fontWeight: "800" }}>Open</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        <PremiumModal
          visible={attachmentsOpen}
          title="Add attachment"
          canClose
          presentation="bottom"
          onClose={() => setAttachmentsOpen(false)}
        >
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between" }}>
            <Pressable
              disabled={!canAttach}
              onPress={() => {
                void pickImage(false);
              }}
              style={({ pressed }) => ({ width: "30%" as any, alignItems: "center", paddingVertical: 10, opacity: !canAttach ? 0.6 : pressed ? 0.7 : 1 })}
            >
              <View style={{ width: 54, height: 54, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                <Ionicons name="images-outline" size={22} color={Colors.dark.textPrimary} />
              </View>
              <Text style={{ color: Colors.dark.textSecondary, fontSize: 12 }}>Gallery</Text>
            </Pressable>

            <Pressable
              disabled={!canAttach}
              onPress={() => {
                void pickImage(true);
              }}
              style={({ pressed }) => ({ width: "30%" as any, alignItems: "center", paddingVertical: 10, opacity: !canAttach ? 0.6 : pressed ? 0.7 : 1 })}
            >
              <View style={{ width: 54, height: 54, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                <Ionicons name="camera-outline" size={22} color={Colors.dark.textPrimary} />
              </View>
              <Text style={{ color: Colors.dark.textSecondary, fontSize: 12 }}>Camera</Text>
            </Pressable>

            <Pressable
              disabled={!canAttach}
              onPress={() => {
                void pickDocument();
              }}
              style={({ pressed }) => ({ width: "30%" as any, alignItems: "center", paddingVertical: 10, opacity: !canAttach ? 0.6 : pressed ? 0.7 : 1 })}
            >
              <View style={{ width: 54, height: 54, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                <Ionicons name="document-text-outline" size={22} color={Colors.dark.textPrimary} />
              </View>
              <Text style={{ color: Colors.dark.textSecondary, fontSize: 12 }}>Document</Text>
            </Pressable>
          </View>
        </PremiumModal>

        <PremiumModal
          visible={shareOpen}
          title="Share to channel"
          canClose={!shareBusy}
          onClose={() => {
            if (!shareBusy) setShareOpen(false);
          }}
        >
          {shareTarget ? (
            <View className="mt-1">
              <Text style={{ color: Colors.dark.textSecondary }}>Preview</Text>
              <Text numberOfLines={4} className="mt-1" style={{ color: Colors.dark.textPrimary, opacity: 0.9 }}>
                {shareTarget.content}
              </Text>
            </View>
          ) : null}

          {shareError ? (
            <View className="mt-3">
              <Text style={{ color: Colors.dark.textSecondary }}>{shareError}</Text>
            </View>
          ) : null}

          {shareBusy ? (
            <View className="mt-4">
              <Text style={{ color: Colors.dark.textSecondary }}>Loading channels...</Text>
            </View>
          ) : shareChannels.length === 0 ? (
            <View className="mt-4">
              <Text style={{ color: Colors.dark.textSecondary }}>No channels available</Text>
            </View>
          ) : (
            <ScrollView className="mt-4" style={{ maxHeight: 260 }}>
              {shareChannels.map((c) => (
                <Pressable
                  key={c._id}
                  onPress={() => {
                    if (!shareBusy) void shareToChannel(c);
                  }}
                  className="rounded-xl border px-3 py-3"
                  style={{
                    borderColor: Colors.dark.border,
                    backgroundColor: c._id === lastShareChannelId ? "rgba(88,101,242,0.16)" : Colors.dark.surface2,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Share to ${c.name}`}
                >
                  <Text className="text-base font-semibold" style={{ color: Colors.dark.textPrimary }}>
                    # {c.name}
                  </Text>
                  <Text className="mt-1 text-sm" style={{ color: Colors.dark.textSecondary }}>
                    {c.isPrivate ? "Private channel" : "Channel"}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </PremiumModal>
      </KeyboardAvoidingView>
    </PremiumScreen>
  );
}

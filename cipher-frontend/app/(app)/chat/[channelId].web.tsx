import React, { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Image, Modal, Platform, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../../hooks/useAuth";
import { useSocket } from "../../../hooks/useSocket";
import { Colors } from "../../../utils/colors";
import { PremiumScreen } from "../../../components/PremiumScreen";
import { createMessage, listMessages } from "../../../services/messages";
import { setChannelLastRead } from "../../../services/chatReadState";
import type { ChatMessageDto } from "../../../types";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { uploadFile } from "../../../services/files";

export default function ChannelScreenWeb(): JSX.Element {
  const params = useLocalSearchParams<{ channelId?: string; channelName?: string; lastMessageAt?: string }>();
  const channelId = (params.channelId ?? "").toString();
  const channelName = (params.channelName ?? "").toString();
  const lastMessageAt = (params.lastMessageAt ?? "").toString();

  const { user } = useAuth();
  const { socket } = useSocket();

  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState<string>("");
  const [isAttachmentsOpen, setIsAttachmentsOpen] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const listRef = useRef<FlatList<ChatMessageDto>>(null);

  const myUserId = user?._id ?? "";

  const title = useMemo(() => {
    if (channelName) return `#${channelName}`;
    return channelId ? "Channel" : "Missing channel";
  }, [channelId, channelName]);

  const orderedMessages = useMemo(() => {
    const next = [...messages];
    next.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return next;
  }, [messages]);

  function scrollToBottom(animated = false): void {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  }

  function upsertMessage(m: ChatMessageDto): void {
    setMessages((prev) => {
      const without = prev.filter((x) => x._id !== m._id);
      return [...without, m];
    });
  }

  async function sendWithAttachments(attachments: { url: string; type: string; name?: string; size?: number }[]): Promise<void> {
    if (!channelId) return;
    const currentText = text.trim();
    setText("");

    try {
      if (socket) {
        socket.emit(
          "send-message",
          { channelId, message: { text: currentText, attachments } },
          (ack?: { ok: boolean; message?: ChatMessageDto }) => {
            const m = ack?.message;
            if (ack?.ok && m?._id) {
              upsertMessage(m);
              scrollToBottom(true);
              if (user?._id && m.createdAt) {
                setChannelLastRead(user._id, channelId, m.createdAt).catch(() => {
                  // ignore
                });
              }
            }
          }
        );
        return;
      }

      const m = await createMessage({ channelId, text: currentText, attachments });
      upsertMessage(m);
      scrollToBottom(true);
      if (user?._id && m.createdAt) {
        setChannelLastRead(user._id, channelId, m.createdAt).catch(() => {
          // ignore
        });
      }
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to send");
    }
  }

  async function pickImage(fromCamera: boolean): Promise<void> {
    if (isUploading) return;
    setError(null);
    try {
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) throw new Error("Camera permission denied");
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) throw new Error("Media library permission denied");
      }

      const res = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
      if ((res as any).canceled) return;
      const asset = (res as any).assets?.[0];
      const uri = String(asset?.uri ?? "");
      if (!uri) return;

      setIsUploading(true);
      const uploaded = await uploadFile({
        uri,
        name: String(asset?.fileName ?? asset?.filename ?? `image_${Date.now()}.jpg`),
        mimeType: String(asset?.mimeType ?? "image/jpeg"),
        kind: "image",
      });
      await sendWithAttachments([{ url: uploaded.url, type: uploaded.type, name: uploaded.name, size: uploaded.size }]);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to upload");
    } finally {
      setIsUploading(false);
      setIsAttachmentsOpen(false);
    }
  }

  async function pickDocument(): Promise<void> {
    if (isUploading) return;
    setError(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
      if ((res as any).canceled) return;
      const asset = (res as any).assets?.[0];
      const uri = String(asset?.uri ?? "");
      if (!uri) return;

      setIsUploading(true);
      const uploaded = await uploadFile({
        uri,
        name: String(asset?.name ?? `file_${Date.now()}`),
        mimeType: String(asset?.mimeType ?? "application/octet-stream"),
        kind: "document",
      });
      await sendWithAttachments([{ url: uploaded.url, type: uploaded.type, name: uploaded.name, size: uploaded.size }]);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to upload");
    } finally {
      setIsUploading(false);
      setIsAttachmentsOpen(false);
    }
  }

  if (Platform.OS !== "web") {
    return (
      <PremiumScreen>
        <Text style={{ color: Colors.dark.textSecondary }}>Web-only screen</Text>
      </PremiumScreen>
    );
  }

  useEffect(() => {
    let active = true;
    if (!channelId) return;

    if (user?._id && lastMessageAt) {
      setChannelLastRead(user._id, channelId, lastMessageAt).catch(() => {
        // ignore
      });
    }

    setIsBusy(true);
    setError(null);
    listMessages(channelId, { limit: 50, offset: 0 })
      .then((res) => {
        if (!active) return;
        setMessages(res.messages);
        scrollToBottom(false);

        const newest = res.messages?.[res.messages.length - 1];
        if (user?._id && newest?.createdAt) {
          setChannelLastRead(user._id, channelId, newest.createdAt).catch(() => {
            // ignore
          });
        }
      })
      .catch((e: any) => {
        if (!active) return;
        setError(typeof e?.message === "string" ? e.message : "Failed to load messages");
      })
      .finally(() => {
        if (active) setIsBusy(false);
      });

    return () => {
      active = false;
    };
  }, [channelId]);

  useEffect(() => {
    if (!socket || !channelId) return;

    socket.emit("join-channel", { channelId });

    const onReceive = (payload: { message: ChatMessageDto }) => {
      const m = payload?.message;
      if (!m || m.channelId !== channelId) return;
      upsertMessage(m);
      scrollToBottom(true);
    };

    socket.on("receive-message", onReceive);

    return () => {
      try {
        socket.emit("leave-channel", { channelId });
      } catch {
        // ignore
      }
      socket.off("receive-message", onReceive);
    };
  }, [socket, channelId]);

  async function onSend(): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || !channelId) return;
    setText("");

    try {
      if (socket) {
        socket.emit(
          "send-message",
          { channelId, message: { text: trimmed } },
          (ack?: { ok: boolean; message?: ChatMessageDto }) => {
            const m = ack?.message;
            if (ack?.ok && m?._id) {
              upsertMessage(m);
              scrollToBottom(true);
              if (user?._id && m.createdAt) {
                setChannelLastRead(user._id, channelId, m.createdAt).catch(() => {
                  // ignore
                });
              }
            }
          }
        );
        return;
      }

      const m = await createMessage({ channelId, text: trimmed });
      upsertMessage(m);
      scrollToBottom(true);
      if (user?._id && m.createdAt) {
        setChannelLastRead(user._id, channelId, m.createdAt).catch(() => {
          // ignore
        });
      }
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to send");
    }
  }

  useEffect(() => {
    if (!channelId) return;
    if (orderedMessages.length === 0) return;
    scrollToBottom(false);
  }, [channelId, orderedMessages.length]);

  const attachmentItems = useMemo(
    () => [
      { key: "gallery", label: "Gallery" },
      { key: "camera", label: "Camera" },
      { key: "document", label: "Document" },
    ],
    []
  );

  return (
    <View style={{ flex: 1, backgroundColor: Colors.dark.background }}>
      <Modal transparent visible={isAttachmentsOpen} animationType="fade" onRequestClose={() => setIsAttachmentsOpen(false)}>
        <Pressable
          onPress={() => setIsAttachmentsOpen(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}
        >
          <Pressable
            onPress={() => {
              // keep open
            }}
            style={{
              backgroundColor: "#0b141a",
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              paddingHorizontal: 16,
              paddingTop: 14,
              paddingBottom: 18,
            }}
          >
            <View style={{ alignItems: "center", paddingBottom: 10 }}>
              <View style={{ width: 44, height: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.2)" }} />
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between" }}>
              {attachmentItems.map((it) => (
                <Pressable
                  key={it.key}
                  disabled={isUploading}
                  onPress={() => {
                    if (it.key === "gallery") void pickImage(false);
                    else if (it.key === "camera") void pickImage(true);
                    else if (it.key === "document") void pickDocument();
                    else setIsAttachmentsOpen(false);
                  }}
                  style={({ pressed }) => ({
                    width: "30%" as any,
                    alignItems: "center",
                    paddingVertical: 10,
                    opacity: isUploading ? 0.6 : pressed ? 0.7 : 1,
                  })}
                >
                  <View
                    style={{
                      width: 54,
                      height: 54,
                      borderRadius: 16,
                      backgroundColor: "rgba(255,255,255,0.08)",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 8,
                    }}
                  >
                    <Text style={{ color: Colors.dark.textPrimary, fontSize: 18 }}>+</Text>
                  </View>
                  <Text style={{ color: Colors.dark.textSecondary, fontSize: 12 }}>{it.label}</Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <View
        style={{
          paddingTop: 12,
          paddingBottom: 10,
          paddingHorizontal: 12,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.08)",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Pressable onPress={() => router.back()} style={{ padding: 10 }}>
          <Ionicons name="arrow-back" size={22} color={Colors.dark.textPrimary} />
        </Pressable>
        <Text style={{ color: Colors.dark.textPrimary, fontWeight: "700" }} numberOfLines={1}>
          {title}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      {error ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
          <Text style={{ color: Colors.dark.textSecondary }}>{error}</Text>
        </View>
      ) : null}

      <FlatList
        ref={listRef}
        data={orderedMessages}
        keyExtractor={(item) => item._id}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12 }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <View
            style={{
              alignSelf: !!myUserId && item.sender?._id === myUserId ? "flex-end" : "flex-start",
              backgroundColor: !!myUserId && item.sender?._id === myUserId ? "#075e54" : "rgba(255,255,255,0.06)",
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 12,
              marginBottom: 10,
              maxWidth: 760,
              width: "100%",
            }}
          >
            {!!myUserId && item.sender?._id === myUserId ? null : (
              <Text style={{ color: Colors.dark.textSecondary, fontSize: 12, marginBottom: 4 }}>
                {item.sender?.name ?? ""}
              </Text>
            )}
            {Array.isArray((item as any).attachments) && (item as any).attachments.length > 0 ? (
              <View style={{ marginBottom: item.text ? 8 : 0, gap: 8 }}>
                {(item as any).attachments.map((a: any, idx: number) => {
                  const url = String(a?.url ?? "");
                  const t = String(a?.type ?? "");
                  const name = String(a?.name ?? "file");
                  if (!url) return null;
                  if (t === "image") {
                    return <Image key={`${url}_${idx}`} source={{ uri: url }} style={{ width: 260, height: 260, borderRadius: 12 }} />;
                  }
                  return (
                    <View key={`${url}_${idx}`} style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.2)" }}>
                      <Text style={{ color: Colors.dark.textPrimary }} numberOfLines={1}>
                        {name}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : null}
            <Text style={{ color: Colors.dark.textPrimary }}>{item.text}</Text>
          </View>
        )}
        ListEmptyComponent={
          !isBusy ? (
            <View style={{ paddingTop: 10 }}>
              <Text style={{ color: Colors.dark.textSecondary }}>No messages yet</Text>
            </View>
          ) : null
        }
      />

      <View
        style={{
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderTopWidth: 1,
          borderTopColor: "rgba(255,255,255,0.08)",
          flexDirection: "row",
          gap: 10,
          alignItems: "flex-end",
        }}
      >
        <Pressable
          onPress={() => setIsAttachmentsOpen(true)}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
          })}
        >
          <Text style={{ color: Colors.dark.textPrimary, fontSize: 22, lineHeight: 22 }}>+</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Message"
            placeholderTextColor={Colors.dark.textSecondary}
            multiline
            style={{
              color: Colors.dark.textPrimary,
              backgroundColor: "rgba(255,255,255,0.06)",
              borderRadius: 16,
              paddingHorizontal: 12,
              paddingVertical: 10,
              maxHeight: 160,
            }}
          />
        </View>
        <Pressable
          onPress={onSend}
          style={({ pressed }) => ({
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 16,
            backgroundColor: pressed ? "rgba(37,211,102,0.7)" : "rgba(37,211,102,1)",
          })}
        >
          <Text style={{ color: "white", fontWeight: "700" }}>Send</Text>
        </Pressable>
      </View>
    </View>
  );
}

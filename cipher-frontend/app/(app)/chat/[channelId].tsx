import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Share, Text, TextInput, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FadeIn } from "../../../components/FadeIn";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { Pop } from "../../../components/Pop";
import { PremiumModal } from "../../../components/PremiumModal";
import { PremiumScreen } from "../../../components/PremiumScreen";
import { Skeleton } from "../../../components/Skeleton";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useAuth } from "../../../hooks/useAuth";
import { useSocket } from "../../../hooks/useSocket";
import { Colors } from "../../../utils/colors";
import {
  createMessage,
  deleteMessage,
  getThread,
  listMessages,
  pinMessage,
  reactMessage,
  unpinMessage,
  updateMessage,
  voteMessagePoll,
} from "../../../services/messages";
import { setChannelLastRead } from "../../../services/chatReadState";
import { clearChatForMe, getChatClearedAt } from "../../../services/chatClearState";
import { getChannel, updateChannel, deleteChannel, type ChannelDetailsDto } from "../../../services/channels";
import { listWorkspaceMembers } from "../../../services/workspaceMembers";
import { invalidateChatLists } from "../../../services/chatListInvalidation";
import type { ChatMessageDto } from "../../../types";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { uploadFile } from "../../../services/files";

let Clipboard: any;
try {
  Clipboard = require("expo-clipboard");
} catch {
  Clipboard = null;
}

function hashStringToInt(input: string): number {
  let h = 0;
  const s = String(input ?? "");
  for (let i = 0; i < s.length; i += 1) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function pickAvatarColor(key: string): string {
  const palette = [
    "#25D366",
    "#34B7F1",
    "#9B59B6",
    "#E67E22",
    "#E74C3C",
    "#1ABC9C",
    "#F1C40F",
    "#2ECC71",
  ];
  const idx = hashStringToInt(key) % palette.length;
  return palette[idx];
}

function firstInitial(text: string): string {
  const t = String(text ?? "").trim();
  return t ? t.slice(0, 1).toUpperCase() : "?";
}

export default function ChannelScreenNative(): JSX.Element {
  const params = useLocalSearchParams<{
    channelId?: string;
    channelName?: string;
    lastMessageAt?: string;
    workspaceId?: string;
    channelCreatedBy?: string;
    postingPolicy?: string;
  }>();
  const channelId = (params.channelId ?? "").toString();
  const channelName = (params.channelName ?? "").toString();
  const lastMessageAt = (params.lastMessageAt ?? "").toString();
  const workspaceId = (params.workspaceId ?? "").toString();
  const channelCreatedBy = (params.channelCreatedBy ?? "").toString();
  const initialPostingPolicyRaw = (params.postingPolicy ?? "").toString();

  const navigation = useNavigation();

  const { user } = useAuth();
  const { socket } = useSocket();

  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState<string>("");
  const [isAttachmentsOpen, setIsAttachmentsOpen] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<{ total: number; index: number; name: string } | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<
    { key: string; uri: string; name: string; mimeType: string; kind: "image" | "document" }[]
  >([]);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [pollOpen, setPollOpen] = useState<boolean>(false);
  const [pollQuestion, setPollQuestion] = useState<string>("");
  const [pollOpt1, setPollOpt1] = useState<string>("");
  const [pollOpt2, setPollOpt2] = useState<string>("");
  const [pollOpt3, setPollOpt3] = useState<string>("");
  const [pollOpt4, setPollOpt4] = useState<string>("");
  const [newThreadOpen, setNewThreadOpen] = useState<boolean>(false);
  const [newThreadText, setNewThreadText] = useState<string>("");

  async function createPoll(): Promise<void> {
    if (!channelId) return;
    const q = pollQuestion.trim();
    const opts = [pollOpt1, pollOpt2, pollOpt3, pollOpt4].map((s) => s.trim()).filter(Boolean);
    if (!q || opts.length < 2) return;

    setPollOpen(false);
    setIsAttachmentsOpen(false);
    setPollQuestion("");
    setPollOpt1("");
    setPollOpt2("");
    setPollOpt3("");
    setPollOpt4("");

    try {
      const m = await createMessage({ channelId, text: "", poll: { question: q, options: opts } });
      upsertMessage(m);
      scrollToBottom(true);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to create poll");
    }
  }

  async function createThreadRoot(): Promise<void> {
    if (!channelId) return;
    const rootText = newThreadText.trim();
    if (!rootText) return;

    setNewThreadText("");
    setNewThreadOpen(false);
    setIsAttachmentsOpen(false);

    try {
      const root = await createMessage({ channelId, text: rootText });
      upsertMessage(root);
      scrollToBottom(true);
      void openThread(root._id);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to start thread");
    }
  }

  function getErrorMessage(e: any, fallback: string): string {
    const serverMsg = e?.response?.data?.message;
    if (typeof serverMsg === "string" && serverMsg.trim()) return serverMsg;
    const msg = e?.message;
    if (typeof msg === "string" && msg.trim()) return msg;
    return fallback;
  }
  const [replyTo, setReplyTo] = useState<ChatMessageDto | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isEmojiOpen, setIsEmojiOpen] = useState<boolean>(false);
  const [infoOpen, setInfoOpen] = useState<boolean>(false);
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState<boolean>(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
  const [searchMode, setSearchMode] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [clearedAt, setClearedAt] = useState<string | null>(null);
  const [postingPolicy, setPostingPolicy] = useState<"everyone" | "admins_only">(
    initialPostingPolicyRaw === "admins_only" ? "admins_only" : "everyone",
  );
  const [myWorkspaceRole, setMyWorkspaceRole] = useState<"admin" | "member" | "guest">("member");
  const [policyBusy, setPolicyBusy] = useState<boolean>(false);
  const [channelInfoOpen, setChannelInfoOpen] = useState<boolean>(false);
  const [channelInfo, setChannelInfo] = useState<ChannelDetailsDto | null>(null);
  const [channelInfoBusy, setChannelInfoBusy] = useState<boolean>(false);
  const [threadOpen, setThreadOpen] = useState<boolean>(false);
  const [threadRootId, setThreadRootId] = useState<string | null>(null);
  const [threadRoot, setThreadRoot] = useState<ChatMessageDto | null>(null);
  const [threadReplies, setThreadReplies] = useState<ChatMessageDto[]>([]);
  const [threadBusy, setThreadBusy] = useState<boolean>(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [threadText, setThreadText] = useState<string>("");
  const [threadNotice, setThreadNotice] = useState<{ rootId: string; text: string } | null>(null);
  const threadNoticeTimerRef = useRef<any>(null);
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

  const visibleMessages = useMemo(() => {
    if (!clearedAt) return orderedMessages;
    const t = new Date(clearedAt).getTime();
    if (Number.isNaN(t)) return orderedMessages;
    return orderedMessages.filter((m) => {
      const mt = new Date(m.createdAt).getTime();
      return Number.isNaN(mt) ? true : mt > t;
    });
  }, [orderedMessages, clearedAt]);

  const filteredMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return visibleMessages;
    return visibleMessages.filter((m) => {
      const text = String(m.text ?? "").toLowerCase();
      const sender = String(m.sender?.name ?? "").toLowerCase();
      return text.includes(q) || sender.includes(q);
    });
  }, [visibleMessages, searchQuery]);

  useEffect(() => {
    const parent = (navigation as any)?.getParent?.();
    if (!parent) return;
    parent.setOptions({ tabBarStyle: { display: "none" } });
    return () => {
      parent.setOptions({ tabBarStyle: { backgroundColor: Colors.dark.card, borderTopColor: Colors.dark.border } });
    };
  }, [navigation]);

  function scrollToBottom(animated = false): void {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  }

  async function onDeleteChannel(): Promise<void> {
    if (!channelId) return;
    setIsBusy(true);
    setError(null);
    try {
      await Promise.race([
        deleteChannel(channelId),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("Request timed out")), 12000);
        }),
      ]);
      setDeleteConfirmOpen(false);
      setMenuOpen(false);
      invalidateChatLists();
      router.back();
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to delete channel");
    } finally {
      setIsBusy(false);
    }
  }

  async function uploadAndSendPending(): Promise<void> {
    if (isUploading) return;
    if (pendingAttachments.length === 0) {
      onSend();
      return;
    }

    setIsUploading(true);
    setUploadStatus(null);
    setError(null);
    try {
      const uploaded: { url: string; type: string; name?: string; size?: number }[] = [];
      const total = pendingAttachments.length;
      for (let i = 0; i < pendingAttachments.length; i += 1) {
        const it = pendingAttachments[i];
        setUploadStatus({ total, index: i + 1, name: it.name });
        const res = await uploadFile({ uri: it.uri, name: it.name, mimeType: it.mimeType, kind: it.kind });
        uploaded.push({ url: res.url, type: res.type, name: res.name, size: res.size });
      }
      setPendingAttachments([]);
      await sendWithAttachments(uploaded);
    } catch (e: any) {
      setError(getErrorMessage(e, "Failed to upload"));
    } finally {
      setUploadStatus(null);
      setIsUploading(false);
    }
  }

  async function openChannelInfo(): Promise<void> {
    if (!channelId) return;
    setChannelInfoBusy(true);
    try {
      const info = await getChannel(channelId);
      setChannelInfo(info);
      setPostingPolicy((info as any).postingPolicy === "admins_only" ? "admins_only" : "everyone");
      setChannelInfoOpen(true);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to load channel");
    } finally {
      setChannelInfoBusy(false);
    }
  }

  const selectedCount = useMemo(() => Object.values(selectedIds).filter(Boolean).length, [selectedIds]);

  const primarySelectedId = useMemo(() => {
    const entry = Object.entries(selectedIds).find(([, v]) => !!v);
    return entry ? entry[0] : null;
  }, [selectedIds]);

  const selectedMessage = useMemo(() => {
    if (!primarySelectedId) return null;
    return messages.find((m) => m._id === primarySelectedId) ?? null;
  }, [messages, primarySelectedId]);

  const selectedMessages = useMemo(() => {
    const ids = new Set(Object.entries(selectedIds).filter(([, v]) => !!v).map(([k]) => k));
    return messages.filter((m) => ids.has(m._id));
  }, [messages, selectedIds]);

  const isSingleSelected = selectedCount === 1;
  const isSelectedMine = isSingleSelected && !!selectedMessage && !!myUserId && selectedMessage.sender?._id === myUserId;
  const areAllSelectedMine = useMemo(() => {
    if (selectedCount < 1) return false;
    if (!myUserId) return false;
    return selectedMessages.every((m) => m.sender?._id === myUserId);
  }, [myUserId, selectedCount, selectedMessages]);

  function clearSelection(): void {
    setSelectedIds({});
    setIsEmojiOpen(false);
    setInfoOpen(false);
  }

  function toggleSelected(id: string): void {
    setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const canPost = useMemo(() => {
    if (postingPolicy !== "admins_only") return true;
    if (!myUserId) return false;
    if (myWorkspaceRole === "admin") return true;
    if (channelCreatedBy && channelCreatedBy === myUserId) return true;
    return false;
  }, [postingPolicy, myUserId, myWorkspaceRole, channelCreatedBy]);

  const canTogglePolicy = useMemo(() => {
    if (!myUserId) return false;
    if (myWorkspaceRole === "admin") return true;
    if (channelCreatedBy && channelCreatedBy === myUserId) return true;
    return false;
  }, [myUserId, myWorkspaceRole, channelCreatedBy]);

  useEffect(() => {
    if (!deleteConfirmOpen && isBusy) {
      setIsBusy(false);
    }
  }, [deleteConfirmOpen, isBusy]);

  async function togglePostingPolicy(): Promise<void> {
    if (!channelId) return;
    if (!canTogglePolicy) return;
    setPolicyBusy(true);
    try {
      const next = postingPolicy === "admins_only" ? "everyone" : "admins_only";
      const updated = await updateChannel(channelId, { postingPolicy: next });
      setPostingPolicy((updated as any).postingPolicy === "admins_only" ? "admins_only" : "everyone");
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to update channel");
    } finally {
      setPolicyBusy(false);
      setMenuOpen(false);
    }
  }

  async function onExportChat(): Promise<void> {
    try {
      const text = orderedMessages
        .map((m) => {
          const name = m.sender?.name ? String(m.sender.name) : "";
          const body = m.deletedAt ? "(deleted)" : String(m.text ?? "");
          const ts = m.createdAt ? new Date(m.createdAt).toLocaleString() : "";
          return `${ts} ${name}: ${body}`.trim();
        })
        .filter(Boolean)
        .join("\n");
      await Share.share({ message: text || "" });
    } catch {
      // ignore
    } finally {
      setMenuOpen(false);
    }
  }

  function onClearChatLocal(): void {
    if (!user?._id || !channelId) {
      setMessages([]);
      setMenuOpen(false);
      return;
    }
    clearChatForMe(user._id, "channel", channelId)
      .then((iso) => {
        setClearedAt(iso);
        setMenuOpen(false);
      })
      .catch(() => {
        setMessages([]);
        setMenuOpen(false);
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
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.8,
            allowsMultipleSelection: true,
            selectionLimit: 10,
          });
      if ((res as any).canceled) return;
      const assets = Array.isArray((res as any).assets) ? (res as any).assets : [];
      const next = assets
        .map((a: any) => {
          const uri = String(a?.uri ?? "");
          if (!uri) return null;
          return {
            key: `${uri}_${Date.now()}_${Math.random()}`,
            uri,
            name: String(a?.fileName ?? a?.filename ?? `image_${Date.now()}.jpg`),
            mimeType: String(a?.mimeType ?? "image/jpeg"),
            kind: "image" as const,
          };
        })
        .filter(Boolean) as { key: string; uri: string; name: string; mimeType: string; kind: "image" }[];

      if (next.length > 0) setPendingAttachments((prev) => [...prev, ...next]);
    } catch (e: any) {
      setError(getErrorMessage(e, "Failed to pick image"));
    } finally {
      setIsAttachmentsOpen(false);
    }
  }

  async function pickDocument(): Promise<void> {
    if (isUploading) return;
    setError(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: true });
      if ((res as any).canceled) return;
      const assets = Array.isArray((res as any).assets) ? (res as any).assets : [];
      const next = assets
        .map((a: any) => {
          const uri = String(a?.uri ?? "");
          if (!uri) return null;
          return {
            key: `${uri}_${Date.now()}_${Math.random()}`,
            uri,
            name: String(a?.name ?? `file_${Date.now()}`),
            mimeType: String(a?.mimeType ?? "application/octet-stream"),
            kind: "document" as const,
          };
        })
        .filter(Boolean) as { key: string; uri: string; name: string; mimeType: string; kind: "document" }[];

      if (next.length > 0) setPendingAttachments((prev) => [...prev, ...next]);
    } catch (e: any) {
      setError(getErrorMessage(e, "Failed to pick document"));
    } finally {
      setIsAttachmentsOpen(false);
    }
  }

  function upsertMessage(m: ChatMessageDto): void {
    setMessages((prev) => {
      const without = prev.filter((x) => x._id !== m._id);
      return [...without, m];
    });
  }

  async function openThread(rootId: string): Promise<void> {
    if (!rootId) return;
    setThreadBusy(true);
    setThreadError(null);
    setThreadRootId(rootId);
    setThreadOpen(true);
    try {
      const res = await getThread(rootId, { limit: 100, offset: 0 });
      setThreadRoot(res.root);
      const replies = Array.isArray(res.replies) ? [...res.replies] : [];
      replies.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      setThreadReplies(replies);
    } catch (e: any) {
      setThreadError(typeof e?.message === "string" ? e.message : "Failed to load thread");
      setThreadRoot(null);
      setThreadReplies([]);
    } finally {
      setThreadBusy(false);
    }
  }

  async function sendThreadReply(): Promise<void> {
    if (!channelId) return;
    if (!threadRootId) return;
    const outgoing = threadText.trim();
    if (!outgoing) return;
    setThreadText("");
    try {
      const m = await createMessage({ channelId, text: outgoing, threadRootId });
      setThreadReplies((prev) => {
        const next = [...prev, m];
        next.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        return next;
      });
      setMessages((prev) =>
        prev.map((x) => (x._id === threadRootId ? ({ ...x, replyCount: (Number((x as any).replyCount ?? 0) + 1) } as any) : x)),
      );
    } catch (e: any) {
      setThreadError(typeof e?.message === "string" ? e.message : "Failed to send reply");
    }
  }

  async function onCopySelected(): Promise<void> {
    if (selectedCount < 1) return;
    try {
      if (Clipboard?.setStringAsync) {
        const text = selectedMessages
          .map((m) => String(m.text ?? "").trim())
          .filter(Boolean)
          .join("\n\n");
        if (text) await Clipboard.setStringAsync(text);
      }
    } catch {
      // ignore
    } finally {
      clearSelection();
    }
  }

  function onReplySelected(): void {
    if (!selectedMessage) return;
    const rootId = String(selectedMessage.threadRootId ?? selectedMessage._id);
    clearSelection();
    void openThread(rootId);
  }

  function onStartEditSelected(): void {
    if (!selectedMessage) return;
    if (!isSelectedMine) return;
    setEditingId(selectedMessage._id);
    setText(selectedMessage.text ?? "");
    clearSelection();
  }

  async function onForwardSelected(): Promise<void> {
    if (!selectedMessage) return;
    const msg = selectedMessage;
    const attachmentLines = Array.isArray((msg as any).attachments)
      ? (msg as any).attachments
          .map((a: any) => String(a?.url ?? "").trim())
          .filter(Boolean)
          .map((u: string) => `📎 ${u}`)
      : [];
    const payload = [msg.text?.trim() ? msg.text.trim() : "", ...attachmentLines].filter(Boolean).join("\n");

    clearSelection();
    try {
      await Share.share({ message: payload || "(empty message)" });
    } catch {
      // ignore
    }
  }

  async function onToggleStarSelected(): Promise<void> {
    if (!isSingleSelected) return;
    if (!selectedMessage?._id) return;
    const id = selectedMessage._id;
    const pinned = !!(selectedMessage as any)?.pinnedAt;
    clearSelection();

    try {
      if (pinned) {
        await unpinMessage(id);
        setMessages((prev) => prev.map((m) => (m._id === id ? { ...(m as any), pinnedAt: null, pinnedBy: null } : m)));
      } else {
        const updated = await pinMessage(id);
        upsertMessage(updated);
      }
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to star");
    }
  }

  async function onDeleteSelected(): Promise<void> {
    if (selectedCount < 1) return;
    if (!areAllSelectedMine) return;
    const ids = selectedMessages.map((m) => m._id).filter(Boolean);
    clearSelection();

    try {
      if (socket) {
        for (const id of ids) {
          socket.emit("delete-message", { messageId: id }, (ack?: { ok: boolean; message?: string }) => {
            if (ack?.ok) {
              setMessages((prev) => prev.filter((m) => m._id !== id));
            }
          });
        }
        return;
      }
      await Promise.all(ids.map((id) => deleteMessage(id)));
      setMessages((prev) => prev.filter((m) => !ids.includes(m._id)));
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to delete");
    }
  }

  async function onReact(emoji: string): Promise<void> {
    if (!isSingleSelected) return;
    if (!selectedMessage?._id) return;
    const id = selectedMessage._id;
    setIsEmojiOpen(false);
    clearSelection();

    try {
      if (socket) {
        socket.emit("react-message", { messageId: id, emoji }, () => {
          // rely on socket broadcast
        });
        return;
      }
      const reactions = await reactMessage({ messageId: id, emoji });
      setMessages((prev) => prev.map((m) => (m._id === id ? { ...m, reactions: reactions as any } : m)));
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to react");
    }
  }

  useEffect(() => {
    let active = true;
    if (!channelId) return;

    if (workspaceId && user?._id) {
      listWorkspaceMembers(workspaceId)
        .then((members) => {
          if (!active) return;
          const me = members.find((m) => m.userId === user._id);
          const role = (me?.role ?? "member") as any;
          setMyWorkspaceRole(role === "admin" || role === "guest" ? role : "member");
        })
        .catch(() => {
          // ignore
        });
    }

    if (user?._id && lastMessageAt) {
      setChannelLastRead(user._id, channelId, lastMessageAt).catch(() => {
        // ignore
      });
    }

    setIsBusy(true);
    setError(null);

    const clearedPromise = user?._id
      ? getChatClearedAt(user._id, "channel", channelId)
          .then((iso) => {
            if (!active) return;
            setClearedAt(iso);
          })
          .catch(() => {
            // ignore
          })
      : Promise.resolve();

    const messagesPromise = listMessages(channelId, { limit: 50, offset: 0 })
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
      });

    void Promise.all([clearedPromise, messagesPromise]).finally(() => {
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
      if (m.threadRootId) {
        const rid = String(m.threadRootId);
        setMessages((prev) => prev.map((x) => (x._id === rid ? ({ ...x, replyCount: (Number((x as any).replyCount ?? 0) + 1) } as any) : x)));
        if (threadOpen && threadRootId && rid === threadRootId) {
          setThreadReplies((prev) => {
            const next = [...prev, m];
            next.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
            return next;
          });
        } else {
          const preview = (m.text ?? "").trim();
          const senderName = (m.sender?.name ?? "").trim();
          const label = `${senderName ? `${senderName}: ` : ""}${preview}`.trim();
          setThreadNotice({ rootId: rid, text: label || "New reply" });
          if (threadNoticeTimerRef.current) {
            clearTimeout(threadNoticeTimerRef.current);
          }
          threadNoticeTimerRef.current = setTimeout(() => {
            setThreadNotice(null);
          }, 4500);
        }
        return;
      }
      upsertMessage(m);
      scrollToBottom(true);
    };

    socket.on("receive-message", onReceive);

    const onEdited = (payload: { messageId: string; text: string }) => {
      const id = payload?.messageId;
      const nextText = String(payload?.text ?? "");
      if (!id) return;
      setMessages((prev) => prev.map((m) => (m._id === id ? { ...m, text: nextText, editedAt: new Date().toISOString() } : m)));
    };

    const onDeleted = (payload: { messageId: string }) => {
      const id = payload?.messageId;
      if (!id) return;
      setMessages((prev) => prev.filter((m) => m._id !== id));
      setSelectedIds((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    };

    const onReaction = (payload: { messageId: string; emoji: string; userId: string }) => {
      const id = payload?.messageId;
      const emoji = String(payload?.emoji ?? "");
      const userId = String(payload?.userId ?? "");
      if (!id || !emoji || !userId) return;
      setMessages((prev) =>
        prev.map((m) => {
          if (m._id !== id) return m;
          const existing = Array.isArray(m.reactions) ? m.reactions : [];
          const has = existing.some((r) => r.emoji === emoji && r.userId === userId);
          const next = has ? existing.filter((r) => !(r.emoji === emoji && r.userId === userId)) : [...existing, { emoji, userId }];
          return { ...m, reactions: next as any };
        })
      );
    };

    socket.on("message-edited", onEdited as any);
    socket.on("message-deleted", onDeleted as any);
    socket.on("message-reaction", onReaction as any);

    return () => {
      try {
        socket.emit("leave-channel", { channelId });
      } catch {
        // ignore
      }
      socket.off("receive-message", onReceive);
      socket.off("message-edited", onEdited as any);
      socket.off("message-deleted", onDeleted as any);
      socket.off("message-reaction", onReaction as any);
      if (threadNoticeTimerRef.current) {
        clearTimeout(threadNoticeTimerRef.current);
      }
    };
  }, [socket, channelId, threadOpen, threadRootId]);

  async function onSend(): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || !channelId) return;

    const quoted = replyTo ? `↩ ${replyTo.sender?.name ?? ""}: ${String(replyTo.text ?? "").slice(0, 200)}\n` : "";
    const outgoing = `${quoted}${trimmed}`.trim();
    setText("");
    setReplyTo(null);

    if (editingId) {
      const mid = editingId;
      setEditingId(null);
      try {
        if (socket) {
          socket.emit("edit-message", { messageId: mid, text: outgoing }, () => {
            // rely on socket broadcast
          });
          return;
        }
        const updated = await updateMessage({ messageId: mid, text: outgoing });
        upsertMessage(updated);
      } catch (e: any) {
        setError(typeof e?.message === "string" ? e.message : "Failed to edit");
      }
      return;
    }

    try {
      if (socket) {
        socket.emit(
          "send-message",
          { channelId, message: { text: outgoing } },
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

      const m = await createMessage({ channelId, text: outgoing });
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
      { key: "poll", label: "Poll" },
      { key: "thread", label: "Thread" },
    ],
    []
  );

  return (
    <PremiumScreen padded={false} topPadding={0}>
      <ConfirmDialog
        visible={clearConfirmOpen}
        title="Clear chat"
        message="This will clear chat history on this device."
        confirmText={isBusy ? "Please wait..." : "Clear"}
        destructive
        onCancel={() => setClearConfirmOpen(false)}
        onConfirm={() => {
          setClearConfirmOpen(false);
          onClearChatLocal();
        }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Modal transparent visible={threadOpen} animationType="fade" onRequestClose={() => setThreadOpen(false)}>
          <Pressable onPress={() => setThreadOpen(false)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}>
            <Pressable onPress={() => {}} style={{ backgroundColor: "#0b141a", borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14, maxHeight: "85%" as any }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900" }}>Thread</Text>
                <Pressable onPress={() => setThreadOpen(false)} style={{ padding: 10 }}>
                  <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900" }}>✕</Text>
                </Pressable>
              </View>
              {threadError ? <Text style={{ color: Colors.dark.textSecondary, marginTop: 8 }}>{threadError}</Text> : null}

              {threadRoot ? (
                <View style={{ marginTop: 10, padding: 12, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.06)" }}>
                  <Text style={{ color: Colors.dark.textSecondary, fontSize: 12, marginBottom: 6 }}>Main message</Text>
                  <Text style={{ color: Colors.dark.textPrimary, fontWeight: "800" }}>{threadRoot.sender?.name ?? ""}</Text>
                  <Text style={{ color: Colors.dark.textPrimary, marginTop: 6 }}>{threadRoot.text}</Text>
                </View>
              ) : threadBusy ? (
                <View style={{ marginTop: 10, padding: 12, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.06)" }}>
                  <Skeleton height={12} width={"38%"} radius={8} />
                  <View style={{ marginTop: 10 }}>
                    <Skeleton height={12} width={"80%"} radius={8} />
                  </View>
                </View>
              ) : null}

              <FlatList
                style={{ marginTop: 10 }}
                data={threadReplies}
                keyExtractor={(it) => it._id}
                renderItem={({ item }) => (
                  <FadeIn>
                    <View style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.06)", marginBottom: 10 }}>
                      <Text style={{ color: Colors.dark.textPrimary, fontWeight: "800" }}>{item.sender?.name ?? ""}</Text>
                      <Text style={{ color: Colors.dark.textPrimary, marginTop: 6 }}>{item.text}</Text>
                    </View>
                  </FadeIn>
                )}
                ListEmptyComponent={
                  threadBusy ? (
                    <View style={{ paddingTop: 2 }}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <View key={i} style={{ marginBottom: 10 }}>
                          <View style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.06)" }}>
                            <Skeleton height={12} width={i % 2 === 0 ? ("52%" as any) : ("38%" as any)} radius={8} />
                            <View style={{ marginTop: 8 }}>
                              <Skeleton height={12} width={i % 2 === 0 ? ("74%" as any) : ("60%" as any)} radius={8} />
                            </View>
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={{ color: Colors.dark.textSecondary, marginTop: 8 }}>No replies yet</Text>
                  )
                }
              />

              <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-end", marginTop: 6 }}>
                <TextInput
                  value={threadText}
                  onChangeText={setThreadText}
                  placeholder="Reply"
                  placeholderTextColor={Colors.dark.textSecondary}
                  multiline
                  style={{ flex: 1, color: Colors.dark.textPrimary, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, maxHeight: 120 }}
                />
                <Pressable
                  onPress={() => void sendThreadReply()}
                  style={({ pressed }) => ({ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16, backgroundColor: pressed ? "rgba(37,211,102,0.7)" : "rgba(37,211,102,1)" })}
                >
                  <Text style={{ color: "white", fontWeight: "900" }}>Send</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        <ConfirmDialog
          visible={deleteConfirmOpen}
          title="Delete channel?"
          message={error ? `This will permanently delete this channel for everyone.\n\nError: ${error}` : "This will permanently delete this channel for everyone."}
          confirmText={isBusy ? "Please wait..." : "Delete"}
          cancelText="Cancel"
          destructive
          busy={isBusy}
          onConfirm={() => {
            void onDeleteChannel();
          }}
          onCancel={() => {
            setDeleteConfirmOpen(false);
            setIsBusy(false);
          }}
        />
        <PremiumModal
          visible={channelInfoOpen}
          title={title}
          canClose
          onClose={() => setChannelInfoOpen(false)}
          style={{ maxHeight: "85%" as any }}
        >
          <Text style={{ color: Colors.dark.textSecondary, marginTop: 2 }}>{(channelInfo as any)?.description ?? ""}</Text>

          <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: Colors.dark.textPrimary, fontWeight: "800" }}>Only admins can send messages</Text>
            {canTogglePolicy ? (
              <Pressable
                disabled={policyBusy}
                onPress={() => void togglePostingPolicy()}
                style={({ pressed }) => ({ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)", opacity: policyBusy ? 0.6 : 1 })}
              >
                <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900" }}>{postingPolicy === "admins_only" ? "ON" : "OFF"}</Text>
              </Pressable>
            ) : (
              <Text style={{ color: Colors.dark.textSecondary, fontWeight: "900" }}>{postingPolicy === "admins_only" ? "ON" : "OFF"}</Text>
            )}
          </View>

          <Text style={{ color: Colors.dark.textPrimary, fontWeight: "800", marginTop: 16 }}>Members</Text>
          <FlatList
            style={{ marginTop: 10 }}
            data={(channelInfo?.members ?? []).filter(Boolean)}
            keyExtractor={(m: any) => String(m.userId)}
            renderItem={({ item }: any) => (
              <View style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.06)", marginBottom: 10 }}>
                <Text style={{ color: Colors.dark.textPrimary, fontWeight: "800" }}>{item.user?.name ?? item.userId}</Text>
                <Text style={{ color: Colors.dark.textSecondary, marginTop: 4 }}>{item.user?.email ?? ""}</Text>
              </View>
            )}
            ListEmptyComponent={!channelInfoBusy ? <Text style={{ color: Colors.dark.textSecondary, marginTop: 10 }}>No members</Text> : null}
          />
        </PremiumModal>

        <PremiumModal
          visible={menuOpen}
          title="Menu"
          canClose
          presentation="bottom"
          onClose={() => setMenuOpen(false)}
        >
          {[
            "Search",
            canTogglePolicy ? "Only admins can send messages" : "",
            "Clear chat",
            canTogglePolicy ? "Delete channel" : "",
            "Export chat",
          ]
            .filter(Boolean)
            .map((label) => (
              <Pressable
                key={label}
                onPress={() => {
                  if (label === "Search") {
                    setMenuOpen(false);
                    setSearchMode(true);
                    requestAnimationFrame(() => {
                      // focus handled by user
                    });
                    return;
                  }
                  if (label === "Only admins can send messages") {
                    void togglePostingPolicy();
                    return;
                  }
                  if (label === "Clear chat") {
                    setMenuOpen(false);
                    setClearConfirmOpen(true);
                    return;
                  }
                  if (label === "Delete channel") {
                    setMenuOpen(false);
                    setError(null);
                    setDeleteConfirmOpen(true);
                    return;
                  }
                  if (label === "Export chat") {
                    void onExportChat();
                    return;
                  }
                  setMenuOpen(false);
                }}
                style={({ pressed }) => ({
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderRadius: 14,
                  backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                  marginTop: 10,
                })}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ color: Colors.dark.textPrimary, fontWeight: "800" }}>{label}</Text>
                  {label === "Only admins can send messages" ? (
                    <Text style={{ color: Colors.dark.textSecondary, fontWeight: "800" }}>
                      {policyBusy ? "…" : postingPolicy === "admins_only" ? "ON" : "OFF"}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
        </PremiumModal>

        <PremiumModal
          visible={isEmojiOpen}
          title="React"
          canClose
          presentation="bottom"
          onClose={() => setIsEmojiOpen(false)}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            {["👍", "❤️", "😂", "😮", "😢", "🙏"].map((e) => (
              <Pressable
                key={e}
                onPress={() => {
                  setIsEmojiOpen(false);
                  void onReact(e);
                }}
                style={({ pressed }) => ({ padding: 10, opacity: pressed ? 0.7 : 1 })}
              >
                <Text style={{ fontSize: 26 }}>{e}</Text>
              </Pressable>
            ))}
          </View>
        </PremiumModal>

        <PremiumModal
          visible={infoOpen}
          title="Message info"
          canClose
          onClose={() => setInfoOpen(false)}
        >
          <Text style={{ color: Colors.dark.textSecondary, marginBottom: 6 }}>Sent: {selectedMessage?.createdAt ?? ""}</Text>
          <Text style={{ color: Colors.dark.textSecondary, marginBottom: 6 }}>Edited: {selectedMessage?.editedAt ?? ""}</Text>
          <Text style={{ color: Colors.dark.textSecondary }}>Read by: {Array.isArray(selectedMessage?.readByUsers) ? selectedMessage?.readByUsers?.length : 0}</Text>
        </PremiumModal>
        <PremiumModal
          visible={isAttachmentsOpen}
          title="Add attachment"
          canClose={!isUploading}
          presentation="bottom"
          onClose={() => {
            if (!isUploading) setIsAttachmentsOpen(false);
          }}
        >
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between" }}>
            {attachmentItems.map((it) => (
              <Pressable
                key={it.key}
                disabled={isUploading}
                onPress={() => {
                  if (it.key === "gallery") void pickImage(false);
                  else if (it.key === "camera") void pickImage(true);
                  else if (it.key === "document") void pickDocument();
                  else if (it.key === "poll") setPollOpen(true);
                  else if (it.key === "thread") setNewThreadOpen(true);
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
                  {it.key === "gallery" ? (
                    <Ionicons name="images-outline" size={22} color={Colors.dark.textPrimary} />
                  ) : it.key === "camera" ? (
                    <Ionicons name="camera-outline" size={22} color={Colors.dark.textPrimary} />
                  ) : it.key === "document" ? (
                    <Ionicons name="document-outline" size={22} color={Colors.dark.textPrimary} />
                  ) : it.key === "poll" ? (
                    <Ionicons name="stats-chart-outline" size={22} color={Colors.dark.textPrimary} />
                  ) : it.key === "thread" ? (
                    <Ionicons name="git-branch-outline" size={22} color={Colors.dark.textPrimary} />
                  ) : (
                    <Ionicons name="add-outline" size={22} color={Colors.dark.textPrimary} />
                  )}
                </View>
                <Text style={{ color: Colors.dark.textSecondary, fontSize: 12 }}>{it.label}</Text>
              </Pressable>
            ))}
          </View>
        </PremiumModal>

        <PremiumModal
          visible={pollOpen}
          title="Create poll"
          canClose={!isUploading}
          presentation="bottom"
          onClose={() => setPollOpen(false)}
        >
          <Text style={{ color: Colors.dark.textSecondary, marginBottom: 8 }}>Question</Text>
          <TextInput
            value={pollQuestion}
            onChangeText={setPollQuestion}
            placeholder="Ask a question"
            placeholderTextColor={Colors.dark.textSecondary}
            style={{
              borderRadius: 14,
              backgroundColor: "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              paddingHorizontal: 12,
              paddingVertical: 10,
              color: Colors.dark.textPrimary,
            }}
          />

          <View style={{ marginTop: 12 }}>
            <Text style={{ color: Colors.dark.textSecondary, marginBottom: 8 }}>Options</Text>
            {[{ v: pollOpt1, s: setPollOpt1 }, { v: pollOpt2, s: setPollOpt2 }, { v: pollOpt3, s: setPollOpt3 }, { v: pollOpt4, s: setPollOpt4 }].map(
              (it, idx) => (
                <TextInput
                  key={idx}
                  value={it.v}
                  onChangeText={it.s}
                  placeholder={`Option ${idx + 1}${idx < 2 ? "" : " (optional)"}`}
                  placeholderTextColor={Colors.dark.textSecondary}
                  style={{
                    marginTop: idx === 0 ? 0 : 8,
                    borderRadius: 14,
                    backgroundColor: "rgba(255,255,255,0.06)",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    color: Colors.dark.textPrimary,
                  }}
                />
              )
            )}
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
            <Pressable
              onPress={() => setPollOpen(false)}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 12,
                borderRadius: 14,
                backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
                alignItems: "center",
              })}
            >
              <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900" }}>Cancel</Text>
            </Pressable>
            <Pressable
              disabled={!pollQuestion.trim() || !(pollOpt1.trim() && pollOpt2.trim())}
              onPress={() => void createPoll()}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 12,
                borderRadius: 14,
                opacity: !pollQuestion.trim() || !(pollOpt1.trim() && pollOpt2.trim()) ? 0.5 : 1,
                backgroundColor: pressed ? "rgba(37,211,102,0.70)" : "rgba(37,211,102,1)",
                alignItems: "center",
              })}
            >
              <Text style={{ color: "white", fontWeight: "900" }}>Create</Text>
            </Pressable>
          </View>
        </PremiumModal>

        <PremiumModal
          visible={newThreadOpen}
          title="Start thread"
          canClose={!isUploading}
          presentation="bottom"
          onClose={() => setNewThreadOpen(false)}
        >
          <Text style={{ color: Colors.dark.textSecondary, marginBottom: 8 }}>Topic</Text>
          <TextInput
            value={newThreadText}
            onChangeText={setNewThreadText}
            placeholder="Write the first message"
            placeholderTextColor={Colors.dark.textSecondary}
            multiline
            textAlignVertical="top"
            style={{
              minHeight: 120,
              borderRadius: 14,
              backgroundColor: "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              paddingHorizontal: 12,
              paddingVertical: 12,
              color: Colors.dark.textPrimary,
            }}
          />
          <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
            <Pressable
              onPress={() => setNewThreadOpen(false)}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 12,
                borderRadius: 14,
                backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
                alignItems: "center",
              })}
            >
              <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900" }}>Cancel</Text>
            </Pressable>
            <Pressable
              disabled={!newThreadText.trim()}
              onPress={() => void createThreadRoot()}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 12,
                borderRadius: 14,
                opacity: !newThreadText.trim() ? 0.5 : 1,
                backgroundColor: pressed ? "rgba(37,211,102,0.70)" : "rgba(37,211,102,1)",
                alignItems: "center",
              })}
            >
              <Text style={{ color: "white", fontWeight: "900" }}>Start</Text>
            </Pressable>
          </View>
        </PremiumModal>

        {threadNotice ? (
          <Pressable
            onPress={() => {
              const rid = threadNotice.rootId;
              setThreadNotice(null);
              void openThread(rid);
            }}
            style={({ pressed }) => ({
              marginHorizontal: 12,
              marginTop: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 14,
              backgroundColor: pressed ? "rgba(37,211,102,0.20)" : "rgba(37,211,102,0.14)",
              borderWidth: 1,
              borderColor: "rgba(37,211,102,0.35)",
            })}
          >
            <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900" }} numberOfLines={1}>
              New reply in a thread
            </Text>
            <Text style={{ color: Colors.dark.textSecondary }} numberOfLines={1}>
              {threadNotice.text}
            </Text>
          </Pressable>
        ) : null}

        <View
          style={{
            paddingTop: 54,
            paddingHorizontal: 12,
            paddingBottom: 10,
            borderBottomWidth: 1,
            borderBottomColor: "rgba(255,255,255,0.08)",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {selectedCount > 0 ? (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Pressable onPress={clearSelection} style={{ padding: 8 }}>
                  <Ionicons name="close" size={22} color={Colors.dark.textPrimary} />
                </Pressable>
                <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900" }}>{selectedCount}</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
                {isSingleSelected ? (
                  <>
                    <Pressable onPress={onReplySelected} style={{ padding: 8 }}>
                      <Ionicons name="return-up-back" size={20} color={Colors.dark.textPrimary} />
                    </Pressable>
                    <Pressable
                      onPress={() => setIsEmojiOpen(true)}
                      style={({ pressed }) => ({ padding: 8, opacity: pressed ? 0.7 : 1 })}
                    >
                      <Ionicons name="happy-outline" size={20} color={Colors.dark.textPrimary} />
                    </Pressable>
                    <Pressable onPress={() => void onToggleStarSelected()} style={({ pressed }) => ({ padding: 8, opacity: pressed ? 0.7 : 1 })}>
                      <Ionicons name="star-outline" size={20} color={Colors.dark.textPrimary} />
                    </Pressable>
                  </>
                ) : null}
                <Pressable onPress={() => void onCopySelected()} style={{ padding: 8 }}>
                  <Ionicons name="copy-outline" size={20} color={Colors.dark.textPrimary} />
                </Pressable>
                <Pressable onPress={() => void onForwardSelected()} style={({ pressed }) => ({ padding: 8, opacity: pressed ? 0.7 : 1 })}>
                  <Ionicons name="arrow-redo-outline" size={20} color={Colors.dark.textPrimary} />
                </Pressable>
                {isSelectedMine ? (
                  <>
                    <Pressable onPress={onStartEditSelected} style={{ padding: 8 }}>
                      <Ionicons name="create-outline" size={20} color={Colors.dark.textPrimary} />
                    </Pressable>
                    <Pressable onPress={() => void onDeleteSelected()} style={{ padding: 8 }}>
                      <Ionicons name="trash-outline" size={20} color={Colors.dark.textPrimary} />
                    </Pressable>
                  </>
                ) : null}
                {isSingleSelected ? (
                  <Pressable
                    onPress={() => {
                      setInfoOpen(true);
                    }}
                    style={({ pressed }) => ({ padding: 8, opacity: pressed ? 0.7 : 1 })}
                  >
                    <Ionicons name="information-circle-outline" size={22} color={Colors.dark.textPrimary} />
                  </Pressable>
                ) : null}
              </View>
            </>
          ) : (
            <>
              <Pressable
                onPress={() => {
                  if (searchMode) {
                    setSearchMode(false);
                    setSearchQuery("");
                    return;
                  }
                  router.back();
                }}
                style={{ padding: 10 }}
              >
                <Ionicons name="arrow-back" size={22} color={Colors.dark.textPrimary} />
              </Pressable>
              {searchMode ? (
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search"
                  placeholderTextColor={Colors.dark.textSecondary}
                  autoFocus
                  style={{
                    flex: 1,
                    color: Colors.dark.textPrimary,
                    backgroundColor: "rgba(255,255,255,0.06)",
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                  }}
                />
              ) : (
                <>
                  <Pressable
                    onPress={() => void openChannelInfo()}
                    style={({ pressed }) => ({
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      backgroundColor: pickAvatarColor(String(channelId || channelName || title)),
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      opacity: pressed ? 0.8 : 1,
                    })}
                  >
                    <Text style={{ color: "rgba(0,0,0,0.78)", fontWeight: "900" }}>{firstInitial(channelName || title)}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void openChannelInfo()}
                    style={({ pressed }) => ({ flex: 1, paddingHorizontal: 10, opacity: pressed ? 0.8 : 1 })}
                  >
                    <Text style={{ color: Colors.dark.textPrimary, fontWeight: "700" }} numberOfLines={1}>
                      {title}
                    </Text>
                  </Pressable>
                </>
              )}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {searchMode ? (
                  <Pressable
                    onPress={() => {
                      setSearchMode(false);
                      setSearchQuery("");
                    }}
                    style={({ pressed }) => ({ padding: 10, opacity: pressed ? 0.7 : 1 })}
                  >
                    <Ionicons name="close" size={22} color={Colors.dark.textPrimary} />
                  </Pressable>
                ) : (
                  <Pressable onPress={() => setMenuOpen(true)} style={({ pressed }) => ({ padding: 10, opacity: pressed ? 0.7 : 1 })}>
                    <Ionicons name="ellipsis-vertical" size={20} color={Colors.dark.textPrimary} />
                  </Pressable>
                )}
              </View>
            </>
          )}
        </View>

        {error ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
            <Text style={{ color: Colors.dark.textSecondary }}>{error}</Text>
          </View>
        ) : null}

        {postingPolicy === "admins_only" && !canPost ? (
          <View style={{ paddingHorizontal: 12, paddingTop: 10 }}>
            <View style={{ backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}>
              <Text style={{ color: Colors.dark.textSecondary }}>Only admins can send messages in this channel</Text>
            </View>
          </View>
        ) : null}

        {threadNotice ? (
          <Pressable
            onPress={() => {
              const rid = threadNotice.rootId;
              setThreadNotice(null);
              void openThread(rid);
            }}
            style={({ pressed }) => ({
              marginHorizontal: 12,
              marginTop: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 14,
              backgroundColor: pressed ? "rgba(37,211,102,0.20)" : "rgba(37,211,102,0.14)",
              borderWidth: 1,
              borderColor: "rgba(37,211,102,0.35)",
            })}
          >
            <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900" }} numberOfLines={1}>
              New reply in a thread
            </Text>
            <Text style={{ color: Colors.dark.textSecondary }} numberOfLines={1}>
              {threadNotice.text}
            </Text>
          </Pressable>
        ) : null}

        <FlatList
          ref={listRef}
          data={filteredMessages}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <FadeIn>
              {(() => {
                const isMine = !!myUserId && item.sender?._id === myUserId;
                const isSelected = !!selectedIds[item._id];
                const poll = (item as any).poll as
                  | { question: string; options: { text: string; votes: string[] }[] }
                  | null
                  | undefined;
                const myVoteIndex = poll
                  ? (poll.options ?? []).findIndex((o) => Array.isArray(o?.votes) && o.votes.includes(myUserId))
                  : -1;
                return (
              <View
                style={{
                  alignSelf: isMine ? "flex-end" : "flex-start",
                  backgroundColor: isSelected
                    ? isMine
                      ? "rgba(37,211,102,0.22)"
                      : "rgba(37,211,102,0.14)"
                    : isMine
                      ? "#075e54"
                      : "rgba(255,255,255,0.06)",
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 12,
                  marginBottom: 10,
                  maxWidth: "86%",
                  borderWidth: isSelected ? 1 : 0,
                  borderColor: isSelected ? "rgba(37,211,102,0.55)" : "transparent",
                }}
              >
                <Pressable
                  onLongPress={() => toggleSelected(item._id)}
                  onPress={() => {
                    if (selectedCount > 0) toggleSelected(item._id);
                  }}
                  style={{}}
                >
              {Number((item as any).replyCount ?? 0) > 0 ? (
                <Pressable
                  onPress={() => void openThread(item._id)}
                  style={({ pressed }) => ({ alignSelf: "flex-start", marginBottom: 8, opacity: pressed ? 0.7 : 1 })}
                >
                  <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.2)" }}>
                    <Text style={{ color: Colors.dark.textPrimary, fontWeight: "800" }}>{String((item as any).replyCount)} replies</Text>
                  </View>
                </Pressable>
              ) : null}
              {Array.isArray((item as any).attachments) && (item as any).attachments.length > 0 ? (
                <View style={{ marginBottom: item.text ? 8 : 0, gap: 8 }}>
                  {(item as any).attachments.map((a: any, idx: number) => {
                    const url = String(a?.url ?? "");
                    const t = String(a?.type ?? "");
                    const name = String(a?.name ?? "file");
                    if (!url) return null;
                    if (t === "image") {
                      return (
                        <Pressable
                          key={`${url}_${idx}`}
                          onPress={() => {
                            void Linking.openURL(url);
                          }}
                        >
                          <Image source={{ uri: url }} style={{ width: 220, height: 220, borderRadius: 12 }} />
                        </Pressable>
                      );
                    }
                    return (
                      <Pressable
                        key={`${url}_${idx}`}
                        onPress={() => {
                          void Linking.openURL(url);
                        }}
                        style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.2)" }}
                      >
                        <Text style={{ color: Colors.dark.textPrimary }} numberOfLines={1}>
                          {name}
                        </Text>
                        <Text style={{ color: Colors.dark.textSecondary, fontSize: 11 }}>Tap to open/download</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              {Array.isArray(item.reactions) && item.reactions.length > 0 ? (
                <View style={{ flexDirection: "row", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                  {Array.from(new Set(item.reactions.map((r) => r.emoji))).slice(0, 6).map((e) => (
                    <Pop key={e}>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.2)" }}>
                        <Text style={{ color: Colors.dark.textPrimary }}>{e}</Text>
                      </View>
                    </Pop>
                  ))}
                </View>
              ) : null}

              {poll && Array.isArray(poll.options) && poll.options.length > 0 ? (
                <View style={{ marginBottom: item.text ? 8 : 0 }}>
                  <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900", marginBottom: 8 }}>{poll.question}</Text>
                  <View style={{ gap: 8 }}>
                    {poll.options.map((o, idx) => {
                      const votes = Array.isArray(o?.votes) ? o.votes : [];
                      const selected = idx === myVoteIndex;
                      return (
                        <Pressable
                          key={`${item._id}_opt_${idx}`}
                          disabled={!myUserId}
                          onPress={() => {
                            void (async () => {
                              try {
                                const updated = await voteMessagePoll({ messageId: item._id, optionIndex: idx });
                                upsertMessage(updated);
                              } catch {
                                // ignore
                              }
                            })();
                          }}
                          style={({ pressed }) => ({
                            paddingHorizontal: 10,
                            paddingVertical: 9,
                            borderRadius: 12,
                            backgroundColor: selected
                              ? "rgba(37,211,102,0.22)"
                              : pressed
                                ? "rgba(255,255,255,0.10)"
                                : "rgba(0,0,0,0.18)",
                            borderWidth: 1,
                            borderColor: selected ? "rgba(37,211,102,0.55)" : "rgba(255,255,255,0.10)",
                          })}
                        >
                          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                            <Text style={{ color: Colors.dark.textPrimary, flex: 1 }}>{o.text}</Text>
                            <Text style={{ color: Colors.dark.textSecondary }}>{votes.length}</Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              <Text style={{ color: Colors.dark.textPrimary }}>{item.text}</Text>
                </Pressable>
              </View>
                );
              })()}
            </FadeIn>
          )}
        ListEmptyComponent={
          isBusy ? (
            <View style={{ paddingTop: 6, paddingHorizontal: 4 }}>
              {Array.from({ length: 7 }).map((_, i) => {
                const isMine = i % 3 === 0;
                const w = i % 2 === 0 ? "64%" : "48%";
                return (
                  <View key={i} style={{ alignSelf: isMine ? "flex-end" : "flex-start", marginBottom: 10, maxWidth: "86%" }}>
                    <View style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.06)" }}>
                      <Skeleton height={12} width={w as any} radius={8} />
                      <View style={{ marginTop: 8 }}>
                        <Skeleton height={12} width={(i % 2 === 0 ? "40%" : "58%") as any} radius={8} />
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={{ paddingTop: 10 }}>
              <Text style={{ color: Colors.dark.textSecondary }}>No messages yet</Text>
            </View>
          )
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
          disabled={!canPost || isUploading}
          onPress={() => setIsAttachmentsOpen(true)}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
            opacity: !canPost || isUploading ? 0.5 : 1,
          })}
        >
          <Text style={{ color: Colors.dark.textPrimary, fontSize: 22, lineHeight: 22 }}>+</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          {uploadStatus ? (
            <Text style={{ color: Colors.dark.textSecondary, fontSize: 12, marginBottom: 6 }} numberOfLines={1}>
              Uploading {uploadStatus.index}/{uploadStatus.total}: {uploadStatus.name}
            </Text>
          ) : isUploading ? (
            <Text style={{ color: Colors.dark.textSecondary, fontSize: 12, marginBottom: 6 }} numberOfLines={1}>
              Uploading attachments…
            </Text>
          ) : pendingAttachments.length > 0 ? (
            <Text style={{ color: Colors.dark.textSecondary, fontSize: 12, marginBottom: 6 }} numberOfLines={1}>
              {pendingAttachments.length} attachment(s) ready
            </Text>
          ) : null}
          {pendingAttachments.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={{ gap: 8 }}>
              {pendingAttachments.map((a) => (
                <View
                  key={a.key}
                  style={{
                    borderRadius: 12,
                    backgroundColor: "rgba(255,255,255,0.06)",
                    borderWidth: 1,
                    borderColor: "rgba(37,211,102,0.45)",
                    padding: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  {a.kind === "image" ? <Image source={{ uri: a.uri }} style={{ width: 40, height: 40, borderRadius: 10 }} /> : <Ionicons name="document" size={22} color={Colors.dark.textPrimary} />}
                  <Text style={{ color: Colors.dark.textPrimary, maxWidth: 160 }} numberOfLines={1}>
                    {a.name}
                  </Text>
                  <Pressable
                    onPress={() => setPendingAttachments((prev) => prev.filter((x) => x.key !== a.key))}
                    hitSlop={12}
                    pressRetentionOffset={12}
                    style={({ pressed }) => ({
                      padding: 6,
                      borderRadius: 999,
                      backgroundColor: pressed ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.08)",
                      opacity: 1,
                    })}
                  >
                    <Ionicons name="close" size={18} color={Colors.dark.textSecondary} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}
          {replyTo ? (
            <View style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, marginBottom: 8, backgroundColor: "rgba(255,255,255,0.06)" }}>
              <Text style={{ color: Colors.dark.textSecondary, fontSize: 12 }} numberOfLines={1}>
                Replying to {replyTo.sender?.name ?? ""}
              </Text>
              <Text style={{ color: Colors.dark.textPrimary, fontSize: 12 }} numberOfLines={1}>
                {replyTo.text}
              </Text>
            </View>
          ) : null}
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Message"
            placeholderTextColor={Colors.dark.textSecondary}
            multiline
            editable={canPost && !isUploading}
            style={{
              color: Colors.dark.textPrimary,
              backgroundColor: "rgba(255,255,255,0.06)",
              borderRadius: 16,
              paddingHorizontal: 12,
              paddingVertical: 10,
              maxHeight: 120,
              opacity: canPost && !isUploading ? 1 : 0.5,
            }}
          />
        </View>
        <Pressable
          disabled={!canPost || isUploading}
          onPress={() => void uploadAndSendPending()}
          style={({ pressed }) => ({
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 16,
            backgroundColor: !canPost || isUploading ? "rgba(37,211,102,0.25)" : pressed ? "rgba(37,211,102,0.7)" : "rgba(37,211,102,1)",
          })}
        >
          <Text style={{ color: "white", fontWeight: "700" }}>{isUploading ? "Uploading..." : editingId ? "Update" : "Send"}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
    </PremiumScreen>
  );
}

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FadeIn } from "../../../../components/FadeIn";
import { ConfirmDialog } from "../../../../components/ConfirmDialog";
import { Pop } from "../../../../components/Pop";
import { PremiumModal } from "../../../../components/PremiumModal";
import { PremiumScreen } from "../../../../components/PremiumScreen";
import { Skeleton } from "../../../../components/Skeleton";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useAuth } from "../../../../hooks/useAuth";
import { Colors } from "../../../../utils/colors";
import {
  addGroupMembers,
  archiveDm,
  deleteDm,
  getDm,
  leaveGroupDm,
  removeGroupMember,
  renameGroupDm,
  setGroupMemberRole,
  type DirectMessageDto,
} from "../../../../services/dms";
import { invalidateChatLists } from "../../../../services/chatListInvalidation";
import { clearChatForMe, getChatClearedAt } from "../../../../services/chatClearState";
import {
  createDmMessage,
  deleteDmMessage,
  getDmThread,
  listDmMessages,
  reactDmMessage,
  updateDmMessage,
  voteDmMessagePoll,
  type DmMessageDto,
} from "../../../../services/dmMessages";
import { useSocket } from "../../../../hooks/useSocket";
import { useCall } from "../../../../hooks/useCall";
import { listWorkspaceMembers, type WorkspaceMemberDto } from "../../../../services/workspaceMembers";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { uploadFile } from "../../../../services/files";

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

export default function DmChatScreen(): JSX.Element {
  const params = useLocalSearchParams<{ dmId?: string }>();
  const dmId = (params.dmId ?? "").toString();

  const navigation = useNavigation();

  const { user } = useAuth();
  const { socket } = useSocket();
  const { startCall } = useCall();

  const [dm, setDm] = useState<DirectMessageDto | null>(null);
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState<boolean>(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
  const [searchMode, setSearchMode] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [clearedAt, setClearedAt] = useState<string | null>(null);

  function getErrorMessage(e: any, fallback: string): string {
    const serverMsg = e?.response?.data?.message;
    if (typeof serverMsg === "string" && serverMsg.trim()) return serverMsg;
    const msg = e?.message;
    if (typeof msg === "string" && msg.trim()) return msg;
    return fallback;
  }

  const [messages, setMessages] = useState<DmMessageDto[]>([]);
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
  const [replyTo, setReplyTo] = useState<DmMessageDto | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isEmojiOpen, setIsEmojiOpen] = useState<boolean>(false);
  const [infoOpen, setInfoOpen] = useState<boolean>(false);
  const [groupInfoOpen, setGroupInfoOpen] = useState<boolean>(false);
  const [groupEditName, setGroupEditName] = useState<string>("");
  const [groupBusy, setGroupBusy] = useState<boolean>(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [addMemberOpen, setAddMemberOpen] = useState<boolean>(false);
  const [addMemberBusy, setAddMemberBusy] = useState<boolean>(false);
  const [addMemberError, setAddMemberError] = useState<string | null>(null);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMemberDto[]>([]);
  const [profileOpen, setProfileOpen] = useState<boolean>(false);
  const [threadOpen, setThreadOpen] = useState<boolean>(false);
  const [threadRootId, setThreadRootId] = useState<string | null>(null);
  const [threadRoot, setThreadRoot] = useState<DmMessageDto | null>(null);
  const [threadReplies, setThreadReplies] = useState<DmMessageDto[]>([]);
  const [threadBusy, setThreadBusy] = useState<boolean>(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [threadText, setThreadText] = useState<string>("");
  const [threadNotice, setThreadNotice] = useState<{ rootId: string; text: string } | null>(null);
  const threadNoticeTimerRef = useRef<any>(null);
  const listRef = useRef<FlatList<DmMessageDto>>(null);

  const myUserId = user?._id ?? "";

  const isGroup = dm?.type === "group";

  const myParticipant = useMemo(() => {
    if (!dm || !myUserId) return null;
    return dm.participants.find((p) => p.userId === myUserId) ?? null;
  }, [dm, myUserId]);

  const isGroupAdmin = useMemo(() => {
    if (!isGroup) return false;
    return (myParticipant?.role ?? "member") === "admin";
  }, [isGroup, myParticipant?.role]);

  const otherParticipant = useMemo(() => {
    if (!dm || !myUserId) return null;
    if (dm.type === "group") return null;
    const p = dm.participants.find((x) => x.userId && x.userId !== myUserId) ?? null;
    return p;
  }, [dm, myUserId]);

  const otherUserId = otherParticipant?.userId ?? "";
  const otherName =
    otherParticipant?.user?.name?.trim() ||
    otherParticipant?.userId?.trim() ||
    String(dm?.name ?? "").trim() ||
    "Direct Message";
  const otherAvatarUrl = otherParticipant?.user?.avatarUrl?.trim() || "";
  const otherStatus = (otherParticipant?.user?.status ?? "offline") as "online" | "offline" | "away";

  const groupName = (dm?.name ?? "").trim() || "Group";
  const groupCount = Array.isArray(dm?.participants) ? dm!.participants.length : 0;

  const canDeleteGroup = useMemo(() => {
    if (!isGroup) return false;
    const createdBy = String(dm?.createdBy ?? "");
    if (createdBy && createdBy === myUserId) return true;
    return isGroupAdmin;
  }, [dm?.createdBy, isGroup, isGroupAdmin, myUserId]);

  useEffect(() => {
    if (!isGroup) return;
    setGroupEditName(groupName);
  }, [isGroup, groupName]);

  useEffect(() => {
    if (!deleteConfirmOpen && isBusy) {
      setIsBusy(false);
    }
  }, [deleteConfirmOpen, isBusy]);

  async function onArchiveChat(): Promise<void> {
    if (!dmId) return;
    setIsBusy(true);
    setError(null);
    try {
      await Promise.race([
        archiveDm(dmId),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("Request timed out")), 12000);
        }),
      ]);
      setDeleteConfirmOpen(false);
      setMenuOpen(false);
      invalidateChatLists();
      router.back();
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to delete chat");
    } finally {
      setIsBusy(false);
    }
  }

  async function createPoll(): Promise<void> {
    if (!dmId) return;
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
      const m = await createDmMessage({ dmId, text: "", poll: { question: q, options: opts } });
      upsertMessage(m);
      scrollToBottom(true);
      invalidateChatLists();
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to create poll");
    }
  }

  async function createThreadRoot(): Promise<void> {
    if (!dmId) return;
    const rootText = newThreadText.trim();
    if (!rootText) return;

    setNewThreadText("");
    setNewThreadOpen(false);
    setIsAttachmentsOpen(false);

    try {
      const root = await createDmMessage({ dmId, text: rootText });
      upsertMessage(root);
      scrollToBottom(true);
      invalidateChatLists();
      void openThread(root._id);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to start thread");
    }
  }

  async function onDeleteGroupChat(): Promise<void> {
    if (!dmId) return;
    setIsBusy(true);
    setError(null);
    try {
      await Promise.race([
        deleteDm(dmId),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("Request timed out")), 12000);
        }),
      ]);
      setDeleteConfirmOpen(false);
      setMenuOpen(false);
      invalidateChatLists();
      router.back();
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to delete group");
    } finally {
      setIsBusy(false);
    }
  }

  const statusLine = useMemo(() => {
    if (isGroup) {
      return groupCount === 1 ? "1 member" : `${groupCount} members`;
    }
    if (otherStatus === "online") return "online";
    if (otherStatus === "away") return "away";
    return "offline";
  }, [isGroup, groupCount, otherStatus]);

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

  async function onExportChat(): Promise<void> {
    try {
      const transcript = orderedMessages
        .map((m) => {
          const name = m.sender?.name ? String(m.sender.name) : "";
          const body = m.deletedAt ? "(deleted)" : String(m.text ?? "");
          const ts = m.createdAt ? new Date(m.createdAt).toLocaleString() : "";
          return `${ts} ${name}: ${body}`.trim();
        })
        .filter(Boolean)
        .join("\n");
      await Share.share({ message: transcript || "" });
    } catch {
      // ignore
    } finally {
      setMenuOpen(false);
    }
  }

  function onClearChat(): void {
    if (!user?._id || !dmId) {
      setMessages([]);
      setMenuOpen(false);
      return;
    }
    clearChatForMe(user._id, "dm", dmId)
      .then((iso) => {
        setClearedAt(iso);
        setMenuOpen(false);
      })
      .catch(() => {
        setMessages([]);
        setMenuOpen(false);
      });
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

  async function onReact(emoji: string): Promise<void> {
    if (!isSingleSelected) return;
    if (!selectedMessage?._id) return;
    try {
      const reactions = await reactDmMessage({ messageId: selectedMessage._id, emoji });
      setMessages((prev) =>
        prev.map((m) => (m._id === selectedMessage._id ? ({ ...m, reactions } as any) : m)),
      );
    } catch {
      // ignore
    } finally {
      setIsEmojiOpen(false);
      clearSelection();
    }
  }

  async function onForwardSelected(): Promise<void> {
    if (!isSingleSelected) return;
    if (!selectedMessage) return;
    try {
      const body = selectedMessage.deletedAt ? "(deleted)" : String(selectedMessage.text ?? "");
      if (body) {
        await Share.share({ message: body });
      }
    } catch {
      // ignore
    } finally {
      clearSelection();
    }
  }

  function onStartEditSelected(): void {
    if (!selectedMessage?._id) return;
    if (selectedMessage.deletedAt) return;
    if (!isSelectedMine) return;
    setEditingId(selectedMessage._id);
    setText(String(selectedMessage.text ?? ""));
    clearSelection();
  }

  async function onDeleteSelected(): Promise<void> {
    if (selectedCount < 1) return;
    if (!areAllSelectedMine) return;
    const ids = selectedMessages.map((m) => m._id).filter(Boolean);
    try {
      await Promise.all(ids.map((id) => deleteDmMessage(id)));
      setMessages((prev) => prev.filter((m) => !ids.includes(m._id)));
      invalidateChatLists();
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to delete");
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

  async function openThread(rootId: string): Promise<void> {
    if (!rootId) return;
    setThreadBusy(true);
    setThreadError(null);
    setThreadRootId(rootId);
    setThreadOpen(true);
    try {
      const res = await getDmThread(rootId, { limit: 100, offset: 0 });
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
    if (!dmId) return;
    const outgoing = threadText.trim();
    if (!outgoing) return;
    setThreadText("");
    try {
      const m = await createDmMessage({ dmId, text: outgoing, threadRootId: threadRootId ?? undefined });
      setThreadReplies((prev) => {
        const next = [...prev, m];
        next.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        return next;
      });
      setMessages((prev) =>
        prev.map((x) => (x._id === threadRootId ? ({ ...x, replyCount: Number((x as any).replyCount ?? 0) + 1 } as any) : x)),
      );
      invalidateChatLists();
    } catch (e: any) {
      setThreadError(typeof e?.message === "string" ? e.message : "Failed to send reply");
    }
  }

  async function sendWithAttachments(attachments: { url: string; type: string; name?: string; size?: number }[]): Promise<void> {
    if (!dmId) return;
    const trimmed = text.trim();
    const quoted = replyTo ? `↩ ${replyTo.sender?.name ?? ""}: ${String(replyTo.text ?? "").slice(0, 200)}\n` : "";
    const outgoing = `${quoted}${trimmed}`.trim();
    setText("");
    setReplyTo(null);

    try {
      const m = await createDmMessage({ dmId, text: outgoing, attachments });
      upsertMessage(m);
      scrollToBottom(true);
      invalidateChatLists();
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to send message");
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
      setError(typeof e?.message === "string" ? e.message : "Failed to upload");
    } finally {
      setIsAttachmentsOpen(false);
    }
  }

  function upsertMessage(m: DmMessageDto): void {
    setMessages((prev) => {
      const without = prev.filter((x) => x._id !== m._id);
      return [...without, m];
    });
  }

  useEffect(() => {
    let active = true;
    if (!dmId) return;

    getDm(dmId)
      .then((res) => {
        if (!active) return;
        setDm(res);
      })
      .catch(() => {
        // ignore
      });

    setIsBusy(true);
    setError(null);
    if (user?._id) {
      getChatClearedAt(user._id, "dm", dmId)
        .then((iso) => {
          if (!active) return;
          setClearedAt(iso);
        })
        .catch(() => {
          // ignore
        });
    }
    listDmMessages(dmId, { limit: 50, offset: 0 })
      .then((res) => {
        if (!active) return;
        setMessages(res.messages);
        scrollToBottom(false);
      })
      .catch((e: any) => {
        if (!active) return;
        setError(typeof e?.message === "string" ? e.message : "Failed to load messages");
      });

    return () => {
      active = false;
    };
  }, [dmId]);

  async function refreshDm(): Promise<void> {
    if (!dmId) return;
    try {
      const next = await getDm(dmId);
      setDm(next);
    } catch {
      // ignore
    }
  }

  async function onOpenGroupInfo(): Promise<void> {
    if (!isGroup) return;
    setGroupError(null);
    setGroupInfoOpen(true);
  }

  async function onRenameGroup(): Promise<void> {
    if (!dmId) return;
    if (!isGroupAdmin) return;
    const name = groupEditName.trim();
    if (!name) {
      setGroupError("Group name is required");
      return;
    }
    setGroupBusy(true);
    setGroupError(null);
    try {
      const updated = await renameGroupDm(dmId, name);
      setDm(updated);
      invalidateChatLists();
    } catch (e: any) {
      setGroupError(typeof e?.message === "string" ? e.message : "Failed to rename group");
    } finally {
      setGroupBusy(false);
    }
  }

  async function onToggleAdmin(targetUserId: string, nextRole: "admin" | "member"): Promise<void> {
    if (!dmId) return;
    if (!isGroupAdmin) return;
    setGroupBusy(true);
    setGroupError(null);
    try {
      const updated = await setGroupMemberRole(dmId, { userId: targetUserId, role: nextRole });
      setDm(updated);
      invalidateChatLists();
    } catch (e: any) {
      setGroupError(typeof e?.message === "string" ? e.message : "Failed to update role");
    } finally {
      setGroupBusy(false);
    }
  }

  async function onRemoveMember(targetUserId: string): Promise<void> {
    if (!dmId) return;
    if (!isGroupAdmin) return;
    setGroupBusy(true);
    setGroupError(null);
    try {
      const updated = await removeGroupMember(dmId, targetUserId);
      setDm(updated);
      invalidateChatLists();
    } catch (e: any) {
      setGroupError(typeof e?.message === "string" ? e.message : "Failed to remove member");
    } finally {
      setGroupBusy(false);
    }
  }

  async function onLeaveGroup(): Promise<void> {
    if (!dmId) return;
    setGroupBusy(true);
    setGroupError(null);
    try {
      await leaveGroupDm(dmId);
      setGroupInfoOpen(false);
      invalidateChatLists();
      router.back();
    } catch (e: any) {
      setGroupError(typeof e?.message === "string" ? e.message : "Failed to leave group");
    } finally {
      setGroupBusy(false);
    }
  }

  async function openAddMember(): Promise<void> {
    if (!isGroup) return;
    const wsId = String(dm?.workspaceId ?? "");
    if (!wsId) {
      setAddMemberError("No workspaceId on this group");
      setAddMemberOpen(true);
      return;
    }
    setAddMemberBusy(true);
    setAddMemberError(null);
    try {
      const members = await listWorkspaceMembers(wsId);
      const existingIds = new Set((dm?.participants ?? []).map((p) => p.userId));
      setWorkspaceMembers(members.filter((m) => !!m.userId && !existingIds.has(m.userId)));
      setAddMemberOpen(true);
    } catch (e: any) {
      setAddMemberError(typeof e?.message === "string" ? e.message : "Failed to load members");
      setAddMemberOpen(true);
    } finally {
      setAddMemberBusy(false);
    }
  }

  async function onAddMember(userId: string): Promise<void> {
    if (!dmId) return;
    if (!isGroupAdmin) return;
    setAddMemberBusy(true);
    setAddMemberError(null);
    try {
      const updated = await addGroupMembers(dmId, [userId]);
      setDm(updated);
      setAddMemberOpen(false);
      invalidateChatLists();
    } catch (e: any) {
      setAddMemberError(typeof e?.message === "string" ? e.message : "Failed to add member");
    } finally {
      setAddMemberBusy(false);
    }
  }

  useEffect(() => {
    if (!socket || !dm || !myUserId) return;

    const onStatus = (payload: { userId: string; status: "online" | "offline" | "away" }) => {
      const uid = String(payload?.userId ?? "");
      const next = {
        ...dm,
        participants: dm.participants.map((p) => {
          if (p.userId !== uid) return p;
          if (!p.user) return { ...p, user: { _id: uid, name: "", avatarUrl: "", status: payload.status } };
          return { ...p, user: { ...p.user, status: payload.status } };
        }),
      };
      setDm(next);
      if (!uid) return;
      setDm((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          participants: prev.participants.map((p) => {
            if (p.userId !== uid) return p;
            if (!p.user) return { ...p, user: { _id: uid, name: "", avatarUrl: "", status: payload.status } };
            return { ...p, user: { ...p.user, status: payload.status } };
          }),
        };
        return next;
      });
    };

    socket.on("user-status-changed", onStatus as any);
    return () => {
      socket.off("user-status-changed", onStatus as any);
    };
  }, [socket, dm, myUserId]);

  useEffect(() => {
    if (!socket || !dmId) return;

    const onReceive = (payload: { message: DmMessageDto }) => {
      const m = payload?.message;
      if (!m || m.dmId !== dmId) return;
      if (m.threadRootId) {
        const rid = String(m.threadRootId);
        setMessages((prev) => prev.map((x) => (x._id === rid ? ({ ...x, replyCount: Number((x as any).replyCount ?? 0) + 1 } as any) : x)));
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

    const onDeleted = (payload: { dmId: string; messageId: string }) => {
      const pid = String((payload as any)?.dmId ?? "");
      const mid = String((payload as any)?.messageId ?? "");
      if (!pid || !mid) return;
      if (pid !== dmId) return;
      setMessages((prev) => prev.filter((x) => x._id !== mid));
      setSelectedIds((prev) => {
        if (!prev[mid]) return prev;
        const next = { ...prev };
        delete next[mid];
        return next;
      });
    };

    socket.on("receive-dm-message", onReceive as any);
    socket.on("dm-message-deleted" as any, onDeleted as any);
    return () => {
      socket.off("receive-dm-message", onReceive as any);
      socket.off("dm-message-deleted" as any, onDeleted as any);
      if (threadNoticeTimerRef.current) {
        clearTimeout(threadNoticeTimerRef.current);
      }
    };
  }, [socket, dmId]);

  async function onSend(): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || !dmId) return;

    const quoted = replyTo ? `↩ ${replyTo.sender?.name ?? ""}: ${String(replyTo.text ?? "").slice(0, 200)}\n` : "";
    const outgoing = `${quoted}${trimmed}`.trim();
    setText("");
    setReplyTo(null);

    if (editingId) {
      const mid = editingId;
      setEditingId(null);
      try {
        const updated = await updateDmMessage({ messageId: mid, text: outgoing });
        upsertMessage(updated);
        invalidateChatLists();
      } catch (e: any) {
        setError(typeof e?.message === "string" ? e.message : "Failed to edit");
      }
      return;
    }

    try {
      const m = await createDmMessage({ dmId, text: outgoing });
      upsertMessage(m);
      scrollToBottom(true);
      invalidateChatLists();
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to send");
    }
  }

  return (
    <PremiumScreen padded={false} topPadding={0}>
      <ConfirmDialog
        visible={clearConfirmOpen}
        title="Clear chat"
        message="This will clear the chat for you on this device."
        confirmText="Clear"
        destructive
        onCancel={() => setClearConfirmOpen(false)}
        onConfirm={() => {
          setClearConfirmOpen(false);
          onClearChat();
        }}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
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

        <Modal transparent visible={profileOpen} animationType="fade" onRequestClose={() => setProfileOpen(false)}>
          <Pressable onPress={() => setProfileOpen(false)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 18 }}>
            <Pressable onPress={() => {}} style={{ backgroundColor: "#0b141a", borderRadius: 16, padding: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: 27,
                    backgroundColor: otherAvatarUrl ? "rgba(255,255,255,0.08)" : pickAvatarColor(String(otherUserId || otherName)),
                    overflow: "hidden",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {otherAvatarUrl ? (
                    <Image source={{ uri: otherAvatarUrl }} style={{ width: 54, height: 54 }} />
                  ) : (
                    <Text style={{ color: "rgba(0,0,0,0.78)", fontWeight: "900" }}>{firstInitial(otherName)}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: Colors.dark.textPrimary, fontSize: 16, fontWeight: "900" }} numberOfLines={1}>
                    {otherName}
                  </Text>
                  <Text style={{ color: Colors.dark.textSecondary, marginTop: 4 }}>{statusLine}</Text>
                </View>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

      <Modal transparent visible={groupInfoOpen} animationType="fade" onRequestClose={() => setGroupInfoOpen(false)}>
        <Pressable onPress={() => setGroupInfoOpen(false)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 18 }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: "#0b141a", borderRadius: 16, padding: 16, maxHeight: "85%" as any }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 27,
                  backgroundColor: pickAvatarColor(String(dmId || groupName)),
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "rgba(0,0,0,0.78)", fontWeight: "900" }}>{firstInitial(groupName)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: Colors.dark.textPrimary, fontSize: 16, fontWeight: "900" }} numberOfLines={1}>
                  {groupName}
                </Text>
                <Text style={{ color: Colors.dark.textSecondary, marginTop: 4 }}>{statusLine}</Text>
              </View>
            </View>

            {groupError ? <Text style={{ color: Colors.dark.textSecondary, marginTop: 10 }}>{groupError}</Text> : null}

            {isGroupAdmin ? (
              <View style={{ marginTop: 12 }}>
                <Text style={{ color: Colors.dark.textSecondary, marginBottom: 6 }}>Group name</Text>
                <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                  <TextInput
                    value={groupEditName}
                    onChangeText={setGroupEditName}
                    placeholder="Group name"
                    placeholderTextColor={Colors.dark.textSecondary}
                    style={{
                      flex: 1,
                      color: Colors.dark.textPrimary,
                      backgroundColor: "rgba(255,255,255,0.06)",
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                    }}
                  />
                  <Pressable
                    disabled={groupBusy}
                    onPress={() => void onRenameGroup()}
                    style={({ pressed }) => ({
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderRadius: 12,
                      backgroundColor: pressed ? "rgba(37,211,102,0.7)" : "rgba(37,211,102,1)",
                      opacity: groupBusy ? 0.6 : 1,
                    })}
                  >
                    <Text style={{ color: "white", fontWeight: "800" }}>Save</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <View style={{ marginTop: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: Colors.dark.textPrimary, fontWeight: "800" }}>Members</Text>
              {isGroupAdmin ? (
                <Pressable
                  disabled={groupBusy}
                  onPress={() => void openAddMember()}
                  style={({ pressed }) => ({ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)" })}
                >
                  <Text style={{ color: Colors.dark.textPrimary, fontWeight: "800" }}>Add</Text>
                </Pressable>
              ) : null}
            </View>

            <FlatList
              style={{ marginTop: 10 }}
              data={dm?.participants ?? []}
              keyExtractor={(p) => p.userId}
              renderItem={({ item }) => {
                const name = item.user?.name ?? item.userId;
                const role = (item.role ?? "member") as "admin" | "member";
                const isMe = item.userId === myUserId;
                return (
                  <View
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderRadius: 12,
                      backgroundColor: "rgba(255,255,255,0.06)",
                      marginBottom: 10,
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: pickAvatarColor(String(item.userId || name)),
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ color: "rgba(0,0,0,0.78)", fontWeight: "900" }}>{firstInitial(String(name))}</Text>
                      </View>
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <Text style={{ color: Colors.dark.textPrimary, fontWeight: "800" }} numberOfLines={1}>
                          {name}{isMe ? " (you)" : ""}
                        </Text>
                        <Text style={{ color: Colors.dark.textSecondary, marginTop: 4 }}>
                          {role === "admin" ? "Admin" : "Member"}
                        </Text>
                      </View>
                      {isGroupAdmin && !isMe ? (
                        <View style={{ flexDirection: "row", gap: 8 }}>
                          <Pressable
                            disabled={groupBusy}
                            onPress={() => void onToggleAdmin(item.userId, role === "admin" ? "member" : "admin")}
                            style={({ pressed }) => ({ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)", opacity: groupBusy ? 0.6 : 1 })}
                          >
                            <Text style={{ color: Colors.dark.textPrimary, fontWeight: "800" }}>{role === "admin" ? "Demote" : "Promote"}</Text>
                          </Pressable>
                          <Pressable
                            disabled={groupBusy}
                            onPress={() => void onRemoveMember(item.userId)}
                            style={({ pressed }) => ({ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: pressed ? "rgba(255,0,0,0.25)" : "rgba(255,0,0,0.18)", opacity: groupBusy ? 0.6 : 1 })}
                          >
                            <Text style={{ color: Colors.dark.textPrimary, fontWeight: "800" }}>Remove</Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              }}
              ListFooterComponent={
                <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 6 }}>
                  <Pressable
                    disabled={groupBusy}
                    onPress={() => void onLeaveGroup()}
                    style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: pressed ? "rgba(255,0,0,0.25)" : "rgba(255,0,0,0.18)", opacity: groupBusy ? 0.6 : 1 })}
                  >
                    <Text style={{ color: Colors.dark.textPrimary, fontWeight: "800" }}>Leave group</Text>
                  </Pressable>
                </View>
              }
            />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal transparent visible={addMemberOpen} animationType="fade" onRequestClose={() => setAddMemberOpen(false)}>
        <Pressable onPress={() => setAddMemberOpen(false)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 18 }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: "#0b141a", borderRadius: 16, padding: 16, maxHeight: "80%" as any }}>
            <Text style={{ color: Colors.dark.textPrimary, fontSize: 16, fontWeight: "900" }}>Add member</Text>
            {addMemberError ? <Text style={{ color: Colors.dark.textSecondary, marginTop: 10 }}>{addMemberError}</Text> : null}
            <FlatList
              style={{ marginTop: 12 }}
              data={workspaceMembers}
              keyExtractor={(m) => m.userId}
              renderItem={({ item }) => (
                <Pressable
                  disabled={addMemberBusy}
                  onPress={() => void onAddMember(item.userId)}
                  style={({ pressed }) => ({
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
                    marginBottom: 10,
                    opacity: addMemberBusy ? 0.6 : 1,
                  })}
                >
                  <Text style={{ color: Colors.dark.textPrimary, fontWeight: "800" }}>{item.user?.name ?? ""}</Text>
                  <Text style={{ color: Colors.dark.textSecondary, marginTop: 4 }}>{item.user?.email ?? ""}</Text>
                </Pressable>
              )}
              ListEmptyComponent={!addMemberBusy ? <Text style={{ color: Colors.dark.textSecondary, marginTop: 10 }}>No members to add</Text> : null}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <PremiumModal
        visible={menuOpen}
        title="Menu"
        canClose
        presentation="bottom"
        onClose={() => setMenuOpen(false)}
      >
        {[
          "Search",
          "Clear chat",
          "Export chat",
          isGroup ? (canDeleteGroup ? "Delete group" : "") : "Delete chat",
          "Report",
          "Block",
          "Add shortcut",
          "Add to list",
        ]
          .filter(Boolean)
          .map((label) => (
            <Pressable
              key={label}
              onPress={() => {
                if (label === "Search") {
                  setMenuOpen(false);
                  setSearchMode(true);
                  return;
                }
                if (label === "Clear chat") {
                  setMenuOpen(false);
                  setClearConfirmOpen(true);
                  return;
                }
                if (label === "Export chat") {
                  void onExportChat();
                  return;
                }
                if (label === "Delete chat" || label === "Delete group") {
                  setMenuOpen(false);
                  setDeleteConfirmOpen(true);
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
              <Text style={{ color: Colors.dark.textPrimary, fontWeight: "800" }}>{label}</Text>
            </Pressable>
          ))}
      </PremiumModal>

      <ConfirmDialog
        visible={deleteConfirmOpen}
        title={isGroup ? "Delete group?" : "Delete chat?"}
        message={
          error
            ? `${isGroup ? "This will permanently delete the group for everyone." : "This will remove the chat from your list."}\n\nError: ${error}`
            : isGroup
              ? "This will permanently delete the group for everyone."
              : "This will remove the chat from your list."
        }
        confirmText={isBusy ? "Please wait..." : "Delete"}
        cancelText="Cancel"
        destructive
        busy={isBusy}
        onConfirm={() => {
          if (isGroup) {
            void onDeleteGroupChat();
            return;
          }
          void onArchiveChat();
        }}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setIsBusy(false);
        }}
      />

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
        <Text style={{ color: Colors.dark.textSecondary }}>Reactions: {Array.isArray(selectedMessage?.reactions) ? selectedMessage?.reactions?.length : 0}</Text>
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
          <Pressable
            disabled={isUploading}
            onPress={() => {
              void pickImage(false);
            }}
            style={({ pressed }) => ({ width: "30%" as any, alignItems: "center", paddingVertical: 10, opacity: isUploading ? 0.6 : pressed ? 0.7 : 1 })}
          >
            <View style={{ width: 54, height: 54, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
              <Ionicons name="images-outline" size={22} color={Colors.dark.textPrimary} />
            </View>
            <Text style={{ color: Colors.dark.textSecondary, fontSize: 12 }}>Gallery</Text>
          </Pressable>
          <Pressable
            disabled={isUploading}
            onPress={() => {
              void pickImage(true);
            }}
            style={({ pressed }) => ({ width: "30%" as any, alignItems: "center", paddingVertical: 10, opacity: isUploading ? 0.6 : pressed ? 0.7 : 1 })}
          >
            <View style={{ width: 54, height: 54, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
              <Ionicons name="camera-outline" size={22} color={Colors.dark.textPrimary} />
            </View>
            <Text style={{ color: Colors.dark.textSecondary, fontSize: 12 }}>Camera</Text>
          </Pressable>
          <Pressable
            disabled={isUploading}
            onPress={() => {
              void pickDocument();
            }}
            style={({ pressed }) => ({ width: "30%" as any, alignItems: "center", paddingVertical: 10, opacity: isUploading ? 0.6 : pressed ? 0.7 : 1 })}
          >
            <View style={{ width: 54, height: 54, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
              <Ionicons name="document-outline" size={22} color={Colors.dark.textPrimary} />
            </View>
            <Text style={{ color: Colors.dark.textSecondary, fontSize: 12 }}>Document</Text>
          </Pressable>

          <Pressable
            disabled={isUploading}
            onPress={() => {
              setPollOpen(true);
            }}
            style={({ pressed }) => ({ width: "30%" as any, alignItems: "center", paddingVertical: 10, opacity: isUploading ? 0.6 : pressed ? 0.7 : 1 })}
          >
            <View style={{ width: 54, height: 54, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
              <Ionicons name="stats-chart-outline" size={22} color={Colors.dark.textPrimary} />
            </View>
            <Text style={{ color: Colors.dark.textSecondary, fontSize: 12 }}>Poll</Text>
          </Pressable>

          <Pressable
            disabled={isUploading}
            onPress={() => {
              setNewThreadOpen(true);
            }}
            style={({ pressed }) => ({ width: "30%" as any, alignItems: "center", paddingVertical: 10, opacity: isUploading ? 0.6 : pressed ? 0.7 : 1 })}
          >
            <View style={{ width: 54, height: 54, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
              <Ionicons name="git-branch-outline" size={22} color={Colors.dark.textPrimary} />
            </View>
            <Text style={{ color: Colors.dark.textSecondary, fontSize: 12 }}>Thread</Text>
          </Pressable>
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
              <Pressable onPress={clearSelection} style={{ padding: 10 }}>
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
                  <Pressable onPress={() => setIsEmojiOpen(true)} style={({ pressed }) => ({ padding: 8, opacity: pressed ? 0.7 : 1 })}>
                    <Ionicons name="happy-outline" size={20} color={Colors.dark.textPrimary} />
                  </Pressable>
                </>
              ) : null}
              <Pressable onPress={() => void onCopySelected()} style={{ padding: 8 }}>
                <Ionicons name="copy-outline" size={20} color={Colors.dark.textPrimary} />
              </Pressable>
              {isSingleSelected ? (
                <Pressable onPress={() => void onForwardSelected()} style={({ pressed }) => ({ padding: 8, opacity: pressed ? 0.7 : 1 })}>
                  <Ionicons name="arrow-redo-outline" size={20} color={Colors.dark.textPrimary} />
                </Pressable>
              ) : null}
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
                <Pressable onPress={() => setInfoOpen(true)} style={({ pressed }) => ({ padding: 8, opacity: pressed ? 0.7 : 1 })}>
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

            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}>
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
                    onPress={() => {
                      if (isGroup) {
                        void onOpenGroupInfo();
                        return;
                      }
                      setProfileOpen(true);
                    }}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      backgroundColor: isGroup
                        ? pickAvatarColor(String(dmId || groupName))
                        : otherAvatarUrl
                          ? "rgba(255,255,255,0.08)"
                          : pickAvatarColor(String(otherUserId || otherName)),
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                    }}
                  >
                    {isGroup ? (
                      <Text style={{ color: "rgba(0,0,0,0.78)", fontWeight: "900" }}>{firstInitial(groupName)}</Text>
                    ) : otherAvatarUrl ? (
                      <Image source={{ uri: otherAvatarUrl }} style={{ width: 34, height: 34 }} />
                    ) : (
                      <Text style={{ color: "rgba(0,0,0,0.78)", fontWeight: "900" }}>{firstInitial(otherName)}</Text>
                    )}
                  </Pressable>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900" }} numberOfLines={1}>
                      {isGroup ? groupName : otherName}
                    </Text>
                    <Text style={{ color: Colors.dark.textSecondary, fontSize: 12 }} numberOfLines={1}>
                      {statusLine}
                    </Text>
                  </View>
                </>
              )}
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
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
                <>
                  <Pressable
                    onPress={() => {
                      if (isGroup) {
                        Alert.alert("Not supported", "Group calls are not supported yet.");
                        return;
                      }
                      if (!otherUserId) return;
                      startCall({ dmId, toUserId: otherUserId, type: "video" });
                    }}
                    style={({ pressed }) => ({ padding: 10, opacity: isGroup ? 0.35 : pressed ? 0.7 : 1 })}
                  >
                    <Ionicons name="videocam" size={22} color={Colors.dark.textPrimary} />
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      if (isGroup) {
                        Alert.alert("Not supported", "Group calls are not supported yet.");
                        return;
                      }
                      if (!otherUserId) return;
                      startCall({ dmId, toUserId: otherUserId, type: "voice" });
                    }}
                    style={({ pressed }) => ({ padding: 10, opacity: isGroup ? 0.35 : pressed ? 0.7 : 1 })}
                  >
                    <Ionicons name="call" size={21} color={Colors.dark.textPrimary} />
                  </Pressable>
                  <Pressable onPress={() => setMenuOpen(true)} style={({ pressed }) => ({ padding: 10, opacity: pressed ? 0.7 : 1 })}>
                    <Ionicons name="ellipsis-vertical" size={20} color={Colors.dark.textPrimary} />
                  </Pressable>
                </>
              )}
            </View>
          </>
        )}
      </View>

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

      {error ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
          <Text style={{ color: Colors.dark.textSecondary }}>{error}</Text>
        </View>
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
                {!item.deletedAt && Array.isArray((item as any).attachments) && (item as any).attachments.length > 0 ? (
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

                {Array.isArray((item as any).reactions) && (item as any).reactions.length > 0 ? (
                  <View style={{ flexDirection: "row", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                    {Array.from(new Set(((item as any).reactions as any[]).map((r) => r.emoji)))
                      .slice(0, 6)
                      .map((e) => (
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
                                  const updated = await voteDmMessagePoll({ messageId: item._id, optionIndex: idx });
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

                <Text
                  style={{
                    color: Colors.dark.textPrimary,
                    opacity: item.deletedAt ? 0.7 : 1,
                    fontStyle: item.deletedAt ? ("italic" as any) : ("normal" as any),
                  }}
                >
                  {item.deletedAt ? "Message deleted" : item.text}
                </Text>
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
          disabled={isUploading}
          onPress={() => setIsAttachmentsOpen(true)}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
            opacity: isUploading ? 0.6 : 1,
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
            editable={!isUploading}
            style={{
              color: Colors.dark.textPrimary,
              backgroundColor: "rgba(255,255,255,0.06)",
              borderRadius: 16,
              paddingHorizontal: 12,
              paddingVertical: 10,
              maxHeight: 120,
              opacity: isUploading ? 0.6 : 1,
            }}
          />
        </View>
        <Pressable
          disabled={isUploading}
          onPress={() => void uploadAndSendPending()}
          style={({ pressed }) => ({
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 16,
            backgroundColor: isUploading ? "rgba(37,211,102,0.25)" : pressed ? "rgba(37,211,102,0.7)" : "rgba(37,211,102,1)",
          })}
        >
          <Text style={{ color: "white", fontWeight: "700" }}>{isUploading ? "Uploading..." : editingId ? "Update" : "Send"}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  </PremiumScreen>
);
}

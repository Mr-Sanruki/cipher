import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "../../../hooks/useAuth";
import { Colors } from "../../../utils/colors";
import { Skeleton } from "../../../components/Skeleton";
import { PremiumScreen } from "../../../components/PremiumScreen";
import { PremiumModal } from "../../../components/PremiumModal";
import { FadeIn } from "../../../components/FadeIn";
import { Pop } from "../../../components/Pop";
import { createChannel, listChannels } from "../../../services/channels";
import { listMessages } from "../../../services/messages";
import { getActiveWorkspaceId, setActiveWorkspaceId } from "../../../services/workspaceSelection";
import { listWorkspaces } from "../../../services/workspaces";
import { useSocket } from "../../../hooks/useSocket";
import { getLastReadMap } from "../../../services/chatReadState";
import { setChannelLastRead } from "../../../services/chatReadState";
import { clearUnreadCount, getUnreadMap, incrementUnreadCount } from "../../../services/chatUnreadState";
import { createDirectDm, listDms, type DirectMessageDto } from "../../../services/dms";
import { createGroupDm } from "../../../services/dms";
import { subscribeChatListInvalidation } from "../../../services/chatListInvalidation";
import { listWorkspaceMembers, type WorkspaceMemberDto } from "../../../services/workspaceMembers";
import type { DmMessageDto } from "../../../services/socket";
import type { ChannelDto } from "../../../types";
import type { ChatMessageDto } from "../../../types";

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

export default function ChatHomeScreenNative(): JSX.Element {
  const { user } = useAuth();
  const { socket } = useSocket();

  const [workspaceId, setWorkspaceIdState] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string>("Workspace");
  const [channels, setChannels] = useState<ChannelDto[]>([]);
  const [dms, setDms] = useState<DirectMessageDto[]>([]);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastByChannelId, setLastByChannelId] = useState<Record<string, ChatMessageDto | undefined>>({});

  const [search, setSearch] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"all" | "channels" | "dms" | "groups">("all");
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>("");
  const [newDesc, setNewDesc] = useState<string>("");
  const [newIsPrivate, setNewIsPrivate] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [lastReadMap, setLastReadMapState] = useState<Record<string, string>>({});
  const [unreadMap, setUnreadMapState] = useState<Record<string, number>>({});

  const [isNewDmOpen, setIsNewDmOpen] = useState<boolean>(false);
  const [dmMembers, setDmMembers] = useState<WorkspaceMemberDto[]>([]);
  const [dmBusy, setDmBusy] = useState<boolean>(false);
  const [dmError, setDmError] = useState<string | null>(null);
  const [dmCreateMode, setDmCreateMode] = useState<"dm" | "group">("dm");
  const [groupName, setGroupName] = useState<string>("");
  const [selectedGroupUserIds, setSelectedGroupUserIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const wsId = await getActiveWorkspaceId();
        const wss = await listWorkspaces();
        const selected = wsId ? wss.find((w) => w._id === wsId) : wss[0];
        const nextId = selected?._id ?? null;
        if (!active) return;
        setWorkspaceIdState(nextId);
        setWorkspaceName(selected?.name ?? "Workspace");
        if (nextId) await setActiveWorkspaceId(nextId);
        if (user?._id) {
          const map = await getLastReadMap(user._id);
          if (!active) return;
          setLastReadMapState(map);

          const unread = await getUnreadMap(user._id);
          if (!active) return;
          setUnreadMapState(unread);
        }
      } catch {
        if (!active) return;
        setWorkspaceIdState(null);
        setWorkspaceName("Workspace");
      }
    })();
    return () => {
      active = false;
    };
  }, [user?._id]);

  const reloadLists = useCallback(async () => {
    if (!workspaceId) return;
    setIsBusy(true);
    setError(null);
    try {
      const next = await listChannels(workspaceId);
      setChannels(next);

      const nextDms = await listDms(workspaceId);
      setDms(nextDms);
      try {
        console.log("chat.reloadLists dms:", Array.isArray(nextDms) ? nextDms.length : "(invalid)");
      } catch {
        // ignore
      }

      const pairs = await Promise.all(
        next.map(async (ch) => {
          try {
            const res = await listMessages(ch._id, { limit: 1, offset: 0 });
            const m = Array.isArray(res.messages) ? res.messages[0] : undefined;
            return [ch._id, m] as const;
          } catch {
            return [ch._id, undefined] as const;
          }
        }),
      );
      setLastByChannelId((prev) => {
        const nextMap = { ...prev };
        for (const [id, m] of pairs) nextMap[id] = m;
        return nextMap;
      });
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to load channels");
      setChannels([]);
    } finally {
      setIsBusy(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void reloadLists();
  }, [reloadLists]);

  useEffect(() => {
    const unsub = subscribeChatListInvalidation(() => {
      void reloadLists();
    });
    return unsub;
  }, [reloadLists]);

  useFocusEffect(
    useCallback(() => {
      void reloadLists();
    }, [reloadLists]),
  );

  const openNewDm = useCallback(async () => {
    if (!workspaceId) return;
    setDmBusy(true);
    setDmError(null);
    setDmCreateMode("dm");
    setGroupName("");
    setSelectedGroupUserIds({});
    try {
      const members = await listWorkspaceMembers(workspaceId);
      setDmMembers(members.filter((m) => String(m.userId) !== String(user?._id ?? "")));
      setIsNewDmOpen(true);
    } catch (e: any) {
      setDmError(typeof e?.message === "string" ? e.message : "Failed to load members");
    } finally {
      setDmBusy(false);
    }
  }, [workspaceId, user?._id]);

  const onCreateDmWith = useCallback(
    async (member: WorkspaceMemberDto) => {
      if (!workspaceId || !member?.user?._id) return;
      setDmBusy(true);
      setDmError(null);
      try {
        const dm = await createDirectDm({ userId: member.user._id, workspaceId });
        setIsNewDmOpen(false);
        setDms((prev) => (prev.some((x) => x._id === dm._id) ? prev : [dm, ...prev]));
        router.push({ pathname: "/(app)/chat/dm/[dmId]", params: { dmId: dm._id } });
      } catch (e: any) {
        setDmError(typeof e?.message === "string" ? e.message : "Failed to create DM");
      } finally {
        setDmBusy(false);
      }
    },
    [workspaceId]
  );

  const onCreateGroup = useCallback(async () => {
    if (!workspaceId) return;
    const name = groupName.trim();
    if (!name) {
      setDmError("Group name is required");
      return;
    }
    const userIds = Object.entries(selectedGroupUserIds)
      .filter(([, v]) => !!v)
      .map(([k]) => k)
      .filter(Boolean);

    if (userIds.length < 1) {
      setDmError("Pick at least 1 member");
      return;
    }

    setDmBusy(true);
    setDmError(null);
    try {
      const dm = await createGroupDm({ userIds, name, workspaceId });
      setDms((prev) => (prev.some((x) => x._id === dm._id) ? prev : [dm, ...prev]));
      setIsNewDmOpen(false);
      router.push({ pathname: "/(app)/chat/dm/[dmId]", params: { dmId: String(dm._id) } });
    } catch (e: any) {
      setDmError(typeof e?.message === "string" ? e.message : "Failed to create group");
    } finally {
      setDmBusy(false);
    }
  }, [workspaceId, groupName, selectedGroupUserIds]);

  useEffect(() => {
    if (!socket || !workspaceId) return;
    socket.emit("join-workspace", { workspaceId });
    return () => {
      try {
        socket.emit("leave-workspace", { workspaceId });
      } catch {
        // ignore
      }
    };
  }, [socket, workspaceId]);

  useEffect(() => {
    if (!socket) return;
    const onReceive = (payload: { message: ChatMessageDto }) => {
      const m = payload?.message;
      if (!m?.channelId) return;
      setLastByChannelId((prev) => {
        const existing = prev[m.channelId];
        if (!existing) return { ...prev, [m.channelId]: m };
        const exTime = new Date(existing.createdAt).getTime();
        const mTime = new Date(m.createdAt).getTime();
        if (mTime >= exTime) return { ...prev, [m.channelId]: m };
        return prev;
      });

      if (user?._id && m.sender?._id === user._id && m.createdAt) {
        setLastReadMapState((prev) => ({ ...prev, [m.channelId]: m.createdAt }));
        setChannelLastRead(user._id, m.channelId, m.createdAt).catch(() => {
          // ignore
        });

        setUnreadMapState((prev) => ({ ...prev, [m.channelId]: 0 }));
        clearUnreadCount(user._id, m.channelId).catch(() => {
          // ignore
        });
        return;
      }

      if (user?._id && m.sender?._id !== user._id) {
        const lastReadIso = lastReadMap[m.channelId];
        const lr = lastReadIso ? new Date(lastReadIso).getTime() : 0;
        const mTime = new Date(m.createdAt).getTime();
        const shouldIncrement = !Number.isNaN(mTime) && (Number.isNaN(lr) || mTime > lr);

        if (shouldIncrement) {
          incrementUnreadCount(user._id, m.channelId, 1)
            .then((next) => {
              setUnreadMapState((prev) => ({ ...prev, [m.channelId]: next }));
            })
            .catch(() => {
              // ignore
            });
        }
      }
    };

    socket.on("receive-message", onReceive);
    return () => {
      socket.off("receive-message", onReceive);
    };
  }, [socket, user?._id, lastByChannelId, lastReadMap]);

  useEffect(() => {
    if (!socket || !workspaceId) return;
    const onDmReceive = (_payload: { message: DmMessageDto }) => {
      listDms(workspaceId)
        .then((next) => setDms(next))
        .catch(() => {
          // ignore
        });
    };

    socket.on("receive-dm-message", onDmReceive as any);
    return () => {
      socket.off("receive-dm-message", onDmReceive as any);
    };
  }, [socket, workspaceId]);

  const isUnread = useCallback(
    (channelId: string): boolean => {
      const last = lastByChannelId[channelId];
      if (!last) return false;
      const lastReadIso = lastReadMap[channelId];
      if (!lastReadIso) return true;
      const lr = new Date(lastReadIso).getTime();
      const lm = new Date(last.createdAt).getTime();
      if (Number.isNaN(lr) || Number.isNaN(lm)) return false;
      return lm > lr;
    },
    [lastByChannelId, lastReadMap]
  );

  const getUnreadCount = useCallback((channelId: string): number => {
    const n = Number(unreadMap[channelId] ?? 0);
    return Number.isFinite(n) && n > 0 ? Math.min(99, Math.floor(n)) : 0;
  }, [unreadMap]);

  const onSelectChannel = useCallback((ch: ChannelDto) => {
    if (!ch?._id) return;
    const last = lastByChannelId[ch._id];
    if (last?.createdAt) {
      setLastReadMapState((prev) => ({ ...prev, [ch._id]: last.createdAt }));
    }

    if (user?._id) {
      setUnreadMapState((prev) => ({ ...prev, [ch._id]: 0 }));
      clearUnreadCount(user._id, ch._id).catch(() => {
        // ignore
      });
    }
    router.push({
      pathname: "/(app)/chat/[channelId]",
      params: {
        channelId: ch._id,
        channelName: ch.name,
        lastMessageAt: last?.createdAt ?? "",
        workspaceId: ch.workspaceId,
        channelCreatedBy: ch.createdBy ?? "",
        postingPolicy: (ch as any).postingPolicy ?? "",
      },
    });
  }, []);

  const selectedGroupIds = useMemo(() => {
    return Object.entries(selectedGroupUserIds)
      .filter(([, v]) => !!v)
      .map(([k]) => k)
      .filter(Boolean);
  }, [selectedGroupUserIds]);

  const toggleGroupMember = useCallback((member: WorkspaceMemberDto): void => {
    const id = String(member?.userId ?? "").trim();
    if (!id) return;
    setSelectedGroupUserIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const canCreateGroup = useMemo(() => {
    if (!workspaceId) return false;
    if (dmBusy) return false;
    if (!groupName.trim()) return false;
    return selectedGroupIds.length >= 1;
  }, [workspaceId, dmBusy, groupName, selectedGroupIds.length]);

  const headerSubtitle = useMemo(() => {
    const name = user?.name ?? "";
    const base = name ? `Signed in as ${name}` : "";
    const counts = workspaceId ? ` • ${channels.length} channels • ${dms.length} dms` : "";
    return `${base}${counts}`.trim();
  }, [user?.name, workspaceId, channels.length, dms.length]);

  const orderedChannels = useMemo(() => {
    const next = [...channels];
    next.sort((a, b) => {
      const am = lastByChannelId[a._id];
      const bm = lastByChannelId[b._id];
      const at = am ? new Date(am.createdAt).getTime() : 0;
      const bt = bm ? new Date(bm.createdAt).getTime() : 0;
      return bt - at;
    });
    return next;
  }, [channels, lastByChannelId]);

  const filteredChannels = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orderedChannels;
    return orderedChannels.filter((ch) => {
      const last = lastByChannelId[ch._id];
      const name = (ch.name ?? "").toLowerCase();
      const desc = (ch.description ?? "").toLowerCase();
      const preview = (last?.text ?? "").toLowerCase();
      return name.includes(q) || desc.includes(q) || preview.includes(q);
    });
  }, [orderedChannels, search, lastByChannelId]);

  const orderedDms = useMemo(() => {
    const next = [...dms];
    next.sort((a, b) => {
      const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bt - at;
    });
    return next;
  }, [dms]);

  const isGroupDm = useCallback(
    (dm: DirectMessageDto): boolean => {
      const count = Array.isArray(dm.participants) ? dm.participants.length : 0;
      // Treat 2-person threads as direct even if backend accidentally marks type as "group".
      if (count >= 3) return true;
      if (count === 2) return false;
      return dm.type === "group";
    },
    [],
  );

  const getDmDisplayName = useCallback(
    (dm: DirectMessageDto): string => {
      if (isGroupDm(dm)) return String(dm.name ?? "Group");
      const other = dm.participants?.find((p) => String(p.userId) !== String(user?._id ?? ""));
      const n = other?.user?.name?.trim();
      if (n) return n;
      return String(dm.name ?? other?.userId ?? "Direct message");
    },
    [isGroupDm, user?._id]
  );

  const orderedDirectDms = useMemo(() => orderedDms.filter((d) => !isGroupDm(d)), [orderedDms, isGroupDm]);
  const orderedGroupDms = useMemo(() => orderedDms.filter((d) => isGroupDm(d)), [orderedDms, isGroupDm]);

  const filteredDms = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = orderedDirectDms;
    if (!q) return base;
    return base.filter((dm) => {
      const name = getDmDisplayName(dm).toLowerCase();
      const other = (dm.participants?.find((p) => p.userId !== user?._id)?.userId ?? "").toLowerCase();
      return name.includes(q) || other.includes(q);
    });
  }, [orderedDirectDms, search, user?._id, getDmDisplayName]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = orderedGroupDms;
    if (!q) return base;
    return base.filter((dm) => {
      const name = getDmDisplayName(dm).toLowerCase();
      return name.includes(q);
    });
  }, [orderedGroupDms, search, getDmDisplayName]);

  const allItems = useMemo(() => {
    const q = search.trim().toLowerCase();

    const chList = q ? filteredChannels : orderedChannels;
    const dmList = q ? filteredDms : orderedDirectDms;
    const grpList = q ? filteredGroups : orderedGroupDms;

    const merged: { key: string; kind: "channel" | "dm" | "group"; item: ChannelDto | DirectMessageDto }[] = [];
    for (const ch of chList) merged.push({ key: `ch:${ch._id}`, kind: "channel", item: ch });
    for (const dm of dmList) merged.push({ key: `dm:${dm._id}`, kind: "dm", item: dm });
    for (const dm of grpList) merged.push({ key: `grp:${dm._id}`, kind: "group", item: dm });

    merged.sort((a, b) => {
      const at =
        a.kind === "channel"
          ? new Date(lastByChannelId[(a.item as ChannelDto)._id]?.createdAt ?? 0).getTime()
          : new Date((a.item as DirectMessageDto).lastMessageAt ?? (a.item as any).updatedAt ?? 0).getTime();
      const bt =
        b.kind === "channel"
          ? new Date(lastByChannelId[(b.item as ChannelDto)._id]?.createdAt ?? 0).getTime()
          : new Date((b.item as DirectMessageDto).lastMessageAt ?? (b.item as any).updatedAt ?? 0).getTime();
      return bt - at;
    });

    return merged;
  }, [search, filteredChannels, filteredDms, filteredGroups, orderedChannels, orderedDirectDms, orderedGroupDms, lastByChannelId]);

  const listData = useMemo(() => {
    if (activeTab === "channels") return filteredChannels;
    if (activeTab === "groups") return filteredGroups.length > 0 ? (filteredGroups as any) : (orderedGroupDms as any);
    if (activeTab === "dms") return filteredDms.length > 0 ? (filteredDms as any) : (orderedDirectDms as any);

    // activeTab === "all"
    if (allItems.length > 0) return allItems as any;
    const merged: { key: string; kind: "channel" | "dm" | "group"; item: ChannelDto | DirectMessageDto }[] = [];
    for (const ch of channels) merged.push({ key: `ch:${ch._id}`, kind: "channel", item: ch });
    for (const dm of dms)
      merged.push({ key: `dm:${dm._id}`, kind: isGroupDm(dm) ? "group" : "dm", item: dm });
    return merged as any;
  }, [activeTab, allItems, channels, dms, filteredChannels, filteredDms, filteredGroups, isGroupDm, orderedDirectDms, orderedGroupDms]);

  const formatTime = useCallback((iso?: string): string => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }, []);

  const canCreate = !!workspaceId && newName.trim().length >= 2;

  const onOpenCreate = useCallback(() => {
    setCreateError(null);
    setNewName("");
    setNewDesc("");
    setNewIsPrivate(false);
    setIsCreateOpen(true);
  }, []);

  const onCreate = useCallback(async () => {
    if (!workspaceId) return;
    const name = newName.trim();
    if (name.length < 2) {
      setCreateError("Channel name is too short");
      return;
    }

    setCreateError(null);
    try {
      const ch = await createChannel({ workspaceId, name, description: newDesc.trim() || undefined, isPrivate: newIsPrivate });
      setChannels((prev) => (prev.some((x) => x._id === ch._id) ? prev : [ch, ...prev]));
      setIsCreateOpen(false);
      router.push({ pathname: "/(app)/chat/[channelId]", params: { channelId: ch._id, channelName: ch.name } });
    } catch (e: any) {
      setCreateError(typeof e?.message === "string" ? e.message : "Failed to create channel");
    }
  }, [workspaceId, newName, newDesc, newIsPrivate]);

  return (
    <PremiumScreen padded={false} topPadding={0}>
      <PremiumModal visible={isCreateOpen} title="New Channel" canClose onClose={() => setIsCreateOpen(false)}>
        <Text style={{ color: Colors.dark.textSecondary, marginTop: 2 }}>Create a channel in this workspace</Text>

        {createError ? <Text style={{ color: Colors.dark.textSecondary, marginTop: 10 }}>{createError}</Text> : null}

        <View style={{ marginTop: 12 }}>
          <Text style={{ color: Colors.dark.textSecondary, marginBottom: 6 }}>Name</Text>
          <TextInput
            value={newName}
            onChangeText={setNewName}
            placeholder="e.g. general"
            placeholderTextColor={Colors.dark.textSecondary}
            style={{
              color: Colors.dark.textPrimary,
              backgroundColor: "rgba(255,255,255,0.06)",
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          />
        </View>

        <View style={{ marginTop: 12 }}>
          <Text style={{ color: Colors.dark.textSecondary, marginBottom: 6 }}>Description</Text>
          <TextInput
            value={newDesc}
            onChangeText={setNewDesc}
            placeholder="Optional"
            placeholderTextColor={Colors.dark.textSecondary}
            style={{
              color: Colors.dark.textPrimary,
              backgroundColor: "rgba(255,255,255,0.06)",
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          />
        </View>

        <Pressable
          onPress={() => setNewIsPrivate((v) => !v)}
          style={({ pressed }) => ({
            marginTop: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.25)",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: newIsPrivate ? "rgba(37,211,102,1)" : "transparent",
            }}
          >
            <Text style={{ color: "#0b141a", fontWeight: "900" }}>{newIsPrivate ? "✓" : ""}</Text>
          </View>
          <Text style={{ color: Colors.dark.textPrimary }}>Private channel</Text>
        </Pressable>

        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <Pressable
            onPress={() => setIsCreateOpen(false)}
            style={({ pressed }) => ({
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 12,
              backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
            })}
          >
            <Text style={{ color: Colors.dark.textPrimary, fontWeight: "700" }}>Cancel</Text>
          </Pressable>
          <Pressable
            disabled={!canCreate}
            onPress={onCreate}
            style={({ pressed }) => ({
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 12,
              backgroundColor: !canCreate
                ? "rgba(37,211,102,0.25)"
                : pressed
                  ? "rgba(37,211,102,0.7)"
                  : "rgba(37,211,102,1)",
            })}
          >
            <Text style={{ color: "white", fontWeight: "800" }}>Create</Text>
          </Pressable>
        </View>
      </PremiumModal>

      <PremiumModal
        visible={isNewDmOpen}
        title={dmCreateMode === "dm" ? "New DM" : "New Group"}
        canClose={!dmBusy}
        onClose={() => {
          if (!dmBusy) setIsNewDmOpen(false);
        }}
        style={{ maxHeight: "80%" as any }}
      >
        <Text style={{ color: Colors.dark.textSecondary, marginTop: 2 }}>
          {dmCreateMode === "dm" ? "Pick a member" : "Pick members and name your group"}
        </Text>
        {dmError ? <Text style={{ color: Colors.dark.textSecondary, marginTop: 10 }}>{dmError}</Text> : null}

        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <Pressable
            disabled={dmBusy}
            onPress={() => setDmCreateMode("dm")}
            style={({ pressed }) => ({
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 999,
              backgroundColor:
                dmCreateMode === "dm" ? "rgba(37,211,102,0.25)" : pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
              opacity: dmBusy ? 0.6 : 1,
            })}
          >
            <Text style={{ color: Colors.dark.textPrimary, fontWeight: "800" }}>DM</Text>
          </Pressable>
          <Pressable
            disabled={dmBusy}
            onPress={() => setDmCreateMode("group")}
            style={({ pressed }) => ({
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 999,
              backgroundColor:
                dmCreateMode === "group" ? "rgba(37,211,102,0.25)" : pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
              opacity: dmBusy ? 0.6 : 1,
            })}
          >
            <Text style={{ color: Colors.dark.textPrimary, fontWeight: "800" }}>Group</Text>
          </Pressable>
        </View>

        {dmCreateMode === "group" ? (
          <View style={{ marginTop: 12 }}>
            <Text style={{ color: Colors.dark.textSecondary, marginBottom: 6 }}>Group name</Text>
            <TextInput
              value={groupName}
              onChangeText={setGroupName}
              placeholder="e.g. Project Team"
              placeholderTextColor={Colors.dark.textSecondary}
              style={{
                color: Colors.dark.textPrimary,
                backgroundColor: "rgba(255,255,255,0.06)",
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            />
          </View>
        ) : null}

        <View style={{ marginTop: 12 }}>
          <FlatList
            data={dmMembers}
            keyExtractor={(m) => m.userId}
            style={{ maxHeight: 420 }}
            renderItem={({ item }) => (
              <Pressable
                disabled={dmBusy}
                onPress={() => {
                  if (dmCreateMode === "dm") {
                    void onCreateDmWith(item);
                    return;
                  }
                  toggleGroupMember(item);
                }}
                style={({ pressed }) => ({
                  paddingVertical: 12,
                  paddingHorizontal: 12,
                  borderRadius: 12,
                  backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
                  marginBottom: 10,
                  opacity: dmBusy ? 0.6 : 1,
                })}
              >
                <Text style={{ color: Colors.dark.textPrimary, fontWeight: "800" }}>{item.user?.name ?? ""}</Text>
                <Text style={{ color: Colors.dark.textSecondary, marginTop: 4 }}>{item.user?.email ?? ""}</Text>
              </Pressable>
            )}
            ListEmptyComponent={!dmBusy ? <Text style={{ color: Colors.dark.textSecondary, marginTop: 10 }}>No members</Text> : null}
          />
        </View>

        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
          <Pressable
            disabled={dmBusy}
            onPress={() => setIsNewDmOpen(false)}
            style={({ pressed }) => ({
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 12,
              backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
              opacity: dmBusy ? 0.6 : 1,
            })}
          >
            <Text style={{ color: Colors.dark.textPrimary, fontWeight: "700" }}>Cancel</Text>
          </Pressable>
          {dmCreateMode === "group" ? (
            <Pressable
              disabled={!canCreateGroup}
              onPress={() => void onCreateGroup()}
              style={({ pressed }) => ({
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 12,
                backgroundColor: !canCreateGroup ? "rgba(37,211,102,0.25)" : pressed ? "rgba(37,211,102,0.7)" : "rgba(37,211,102,1)",
              })}
            >
              <Text style={{ color: "white", fontWeight: "800" }}>{dmBusy ? "Please wait..." : "Create Group"}</Text>
            </Pressable>
          ) : null}
        </View>
      </PremiumModal>

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
        <Text style={{ color: Colors.dark.textPrimary, fontSize: 20, fontWeight: "800" }}>{workspaceName}</Text>
        {headerSubtitle ? (
          <Text style={{ color: "rgba(255,255,255,0.72)", marginTop: 4, fontSize: 12 }}>{headerSubtitle}</Text>
        ) : null}

        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <Pressable
            onPress={() => setActiveTab("all")}
            style={({ pressed }) => ({
              paddingVertical: 7,
              paddingHorizontal: 12,
              borderRadius: 999,
              backgroundColor:
                activeTab === "all" ? "rgba(16,185,129,0.18)" : pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: activeTab === "all" ? "rgba(16,185,129,0.22)" : "rgba(255,255,255,0.08)",
            })}
          >
            <Text style={{ color: activeTab === "all" ? "white" : "rgba(255,255,255,0.9)", fontWeight: "800" }}>All</Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab("channels")}
            style={({ pressed }) => ({
              paddingVertical: 7,
              paddingHorizontal: 12,
              borderRadius: 999,
              backgroundColor:
                activeTab === "channels" ? "rgba(16,185,129,0.18)" : pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: activeTab === "channels" ? "rgba(16,185,129,0.22)" : "rgba(255,255,255,0.08)",
            })}
          >
            <Text style={{ color: activeTab === "channels" ? "white" : "rgba(255,255,255,0.9)", fontWeight: "800" }}>Channels</Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab("dms")}
            style={({ pressed }) => ({
              paddingVertical: 7,
              paddingHorizontal: 12,
              borderRadius: 999,
              backgroundColor:
                activeTab === "dms" ? "rgba(16,185,129,0.18)" : pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: activeTab === "dms" ? "rgba(16,185,129,0.22)" : "rgba(255,255,255,0.08)",
            })}
          >
            <Text style={{ color: activeTab === "dms" ? "white" : "rgba(255,255,255,0.9)", fontWeight: "800" }}>DMs</Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab("groups")}
            style={({ pressed }) => ({
              paddingVertical: 7,
              paddingHorizontal: 12,
              borderRadius: 999,
              backgroundColor:
                activeTab === "groups" ? "rgba(16,185,129,0.18)" : pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: activeTab === "groups" ? "rgba(16,185,129,0.22)" : "rgba(255,255,255,0.08)",
            })}
          >
            <Text style={{ color: activeTab === "groups" ? "white" : "rgba(255,255,255,0.9)", fontWeight: "800" }}>Groups</Text>
          </Pressable>
        </View>

        <View style={{ marginTop: 12 }}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search"
            placeholderTextColor="rgba(255,255,255,0.6)"
            style={{
              color: Colors.dark.textPrimary,
              backgroundColor: "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
              borderRadius: 16,
              paddingHorizontal: 14,
              paddingVertical: 10,
            }}
          />
        </View>
      </View>

      {workspaceId ? null : (
        <View className="flex-1 px-4 pt-6">
          <Text style={{ color: Colors.dark.textSecondary }}>No workspace selected</Text>
        </View>
      )}

      {error ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <Text style={{ color: Colors.dark.textSecondary }}>{error}</Text>
        </View>
      ) : null}

      <FlatList
        data={listData}
        keyExtractor={(item: any) => (activeTab === "all" ? String(item.key) : String(item._id))}
        contentContainerStyle={{ paddingVertical: 8 }}
        refreshing={isBusy}
        onRefresh={() => {
          void reloadLists();
        }}
        ListHeaderComponent={
          isBusy ? (
            <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
              <View style={{ borderRadius: 14, padding: 12, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" }}>
                <Skeleton height={12} width={"46%"} radius={8} />
                <View style={{ marginTop: 8 }}>
                  <Skeleton height={12} width={"70%"} radius={8} />
                </View>
              </View>
            </View>
          ) : null
        }
        renderItem={({ item }: any) => (
          <FadeIn>
            <Pressable
              onPress={() => {
                if (activeTab === "all") {
                  if (item.kind === "channel") {
                    onSelectChannel(item.item as ChannelDto);
                    return;
                  }
                  router.push({ pathname: "/(app)/chat/dm/[dmId]", params: { dmId: String((item.item as DirectMessageDto)._id) } });
                  return;
                }
                if (activeTab === "channels") {
                  onSelectChannel(item as ChannelDto);
                  return;
                }
                router.push({ pathname: "/(app)/chat/dm/[dmId]", params: { dmId: String(item._id) } });
              }}
              style={({ pressed }) => ({
                paddingHorizontal: 16,
                paddingVertical: 14,
                backgroundColor: pressed ? "rgba(255,255,255,0.06)" : "transparent",
                borderBottomWidth: 1,
                borderBottomColor: "rgba(255,255,255,0.06)",
              })}
            >
              {(() => {
                const channelId = activeTab === "channels" ? String(item._id) : "";
                const unreadCount = channelId ? getUnreadCount(channelId) : 0;
                return (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor:
                      activeTab === "channels"
                        ? pickAvatarColor(String(item._id))
                        : activeTab === "all"
                          ? item.kind === "channel"
                            ? pickAvatarColor(String((item.item as ChannelDto)._id))
                            : pickAvatarColor(String((item.item as DirectMessageDto)._id))
                          : pickAvatarColor(String(item._id)),
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: "rgba(0,0,0,0.78)", fontWeight: "900" }}>
                    {activeTab === "channels"
                      ? firstInitial(String(item.name ?? ""))
                      : activeTab === "all"
                        ? item.kind === "channel"
                          ? firstInitial(String((item.item as ChannelDto).name ?? ""))
                          : firstInitial(getDmDisplayName(item.item as DirectMessageDto))
                        : activeTab === "groups"
                          ? firstInitial(getDmDisplayName(item as DirectMessageDto))
                          : firstInitial(getDmDisplayName(item as DirectMessageDto))}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={{ color: Colors.dark.textPrimary, fontWeight: "700" }} numberOfLines={1}>
                      {activeTab === "channels"
                        ? String(item.name ?? "")
                        : activeTab === "all"
                          ? item.kind === "channel"
                            ? String((item.item as ChannelDto).name ?? "")
                            : getDmDisplayName(item.item as DirectMessageDto)
                          : getDmDisplayName(item as DirectMessageDto)}
                    </Text>
                    <Text style={{ color: Colors.dark.textSecondary, fontSize: 12 }}>
                      {activeTab === "channels"
                        ? formatTime(lastByChannelId[item._id]?.createdAt)
                        : activeTab === "all"
                          ? item.kind === "channel"
                            ? formatTime(lastByChannelId[(item.item as ChannelDto)._id]?.createdAt)
                            : formatTime((item.item as DirectMessageDto).lastMessageAt)
                          : formatTime((item as DirectMessageDto).lastMessageAt)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                    <Text style={{ color: Colors.dark.textSecondary, flex: 1 }} numberOfLines={1}>
                      {activeTab === "channels"
                        ? lastByChannelId[item._id]?.text ?? item.description ?? ""
                        : activeTab === "all"
                          ? item.kind === "channel"
                            ? lastByChannelId[(item.item as ChannelDto)._id]?.text ?? (item.item as ChannelDto).description ?? ""
                            : "Tap to open"
                          : "Tap to open"}
                    </Text>
                    {activeTab === "channels" && unreadCount > 0 ? (
                      <Pop>
                        <View
                          style={{
                            minWidth: 22,
                            height: 22,
                            borderRadius: 11,
                            backgroundColor: "rgba(37,211,102,1)",
                            alignItems: "center",
                            justifyContent: "center",
                            marginLeft: 12,
                            paddingHorizontal: 6,
                          }}
                        >
                          <Text style={{ color: "#0b141a", fontWeight: "900", fontSize: 12 }}>
                            {unreadCount > 99 ? "99+" : String(unreadCount)}
                          </Text>
                        </View>
                      </Pop>
                    ) : null}
                  </View>
                </View>
              </View>
                );
              })()}
            </Pressable>
          </FadeIn>
        )}
        ListEmptyComponent={
          workspaceId ? (
            isBusy ? (
              <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <View
                    key={i}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      paddingVertical: 14,
                      borderBottomWidth: 1,
                      borderBottomColor: "rgba(255,255,255,0.06)",
                    }}
                  >
                    <Skeleton height={44} width={44} radius={22} />
                    <View style={{ flex: 1 }}>
                      <Skeleton height={14} width={"55%"} radius={10} />
                      <View style={{ marginTop: 10 }}>
                        <Skeleton height={12} width={"80%"} radius={10} />
                      </View>
                    </View>
                    <Skeleton height={12} width={44} radius={8} />
                  </View>
                ))}
              </View>
            ) : (
              <View style={{ paddingHorizontal: 16, paddingTop: 18 }}>
                <Text style={{ color: Colors.dark.textSecondary }}>
                  {search.trim() ? "No results" : activeTab === "channels" ? "No channels yet" : "No DMs yet"}
                </Text>
              </View>
            )
          ) : null
        }
      />

      <Pressable
        onPress={() => {
          if (activeTab === "channels") {
            onOpenCreate();
            return;
          }
          void openNewDm();
        }}
        style={({ pressed }) => ({
          position: "absolute",
          right: 18,
          bottom: 22,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: pressed ? "rgba(37,211,102,0.7)" : "rgba(37,211,102,1)",
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000",
          shadowOpacity: 0.35,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 6 },
        })}
      >
        <Text style={{ color: "white", fontSize: 28, fontWeight: "900", marginTop: -2 }}>+</Text>
      </Pressable>
    </PremiumScreen>
  );
}

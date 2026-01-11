import React, { useEffect, useMemo, useState } from "react";
import { FlatList, Modal, Platform, Pressable, Text, TextInput, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../../hooks/useAuth";
import { Colors } from "../../../utils/colors";
import { PremiumScreen } from "../../../components/PremiumScreen";
import { createChannel, listChannels } from "../../../services/channels";
import { listMessages } from "../../../services/messages";
import { getActiveWorkspaceId, setActiveWorkspaceId } from "../../../services/workspaceSelection";
import { listWorkspaces } from "../../../services/workspaces";
import { useSocket } from "../../../hooks/useSocket";
import { getLastReadMap } from "../../../services/chatReadState";
import { setChannelLastRead } from "../../../services/chatReadState";
import { clearUnreadCount, getUnreadMap, incrementUnreadCount } from "../../../services/chatUnreadState";
import { createDirectDm, listDms, type DirectMessageDto } from "../../../services/dms";
import { listWorkspaceMembers, type WorkspaceMemberDto } from "../../../services/workspaceMembers";
import type { DmMessageDto } from "../../../services/socket";
import type { ChannelDto } from "../../../types";
import type { ChatMessageDto } from "../../../types";
import type { WorkspaceDto } from "../../../types";

export default function ChatHomeScreenWeb(): JSX.Element {
  const { socket } = useSocket();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const [workspaceId, setWorkspaceIdState] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string>("Workspace");
  const [workspaces, setWorkspaces] = useState<WorkspaceDto[]>([]);
  const [isWorkspacePickerOpen, setIsWorkspacePickerOpen] = useState<boolean>(false);
  const [channels, setChannels] = useState<ChannelDto[]>([]);
  const [dms, setDms] = useState<DirectMessageDto[]>([]);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastByChannelId, setLastByChannelId] = useState<Record<string, ChatMessageDto | undefined>>({});

  const [search, setSearch] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"channels" | "dms">("channels");
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

  const isTwoPane = width >= 980;

  if (Platform.OS !== "web") {
    return (
      <PremiumScreen>
        <Text style={{ color: Colors.dark.textSecondary }}>Web-only screen</Text>
      </PremiumScreen>
    );
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const wsId = await getActiveWorkspaceId();
        const wss = await listWorkspaces();
        const selected = wsId ? wss.find((w) => w._id === wsId) : wss[0];
        const nextId = selected?._id ?? null;
        if (!active) return;
        setWorkspaces(wss);
        setWorkspaceIdState(nextId);
        setWorkspaceName(selected?.name ?? "Workspace");
        if (nextId) await setActiveWorkspaceId(nextId);
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

  async function onPickWorkspace(next: WorkspaceDto): Promise<void> {
    setIsWorkspacePickerOpen(false);
    setError(null);
    setWorkspaceIdState(next._id);
    setWorkspaceName(next.name);
    await setActiveWorkspaceId(next._id);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const userId = user?._id;
        if (!userId) return;
        const map = await getLastReadMap(userId);
        if (!active) return;
        setLastReadMapState(map);

        const unread = await getUnreadMap(userId);
        if (!active) return;
        setUnreadMapState(unread);
      } catch {
        // ignore
      }
    })();
    return () => {
      active = false;
    };
  }, [user?._id]);

  useEffect(() => {
    let active = true;
    if (!workspaceId) return;

    setIsBusy(true);
    setError(null);
    (async () => {
      try {
        const next = await listChannels(workspaceId);
        if (!active) return;
        setChannels(next);

        const nextDms = await listDms(workspaceId);
        if (!active) return;
        setDms(nextDms);

        const pairs = await Promise.all(
          next.map(async (ch) => {
            try {
              const res = await listMessages(ch._id, { limit: 1, offset: 0 });
              const m = Array.isArray(res.messages) ? res.messages[0] : undefined;
              return [ch._id, m] as const;
            } catch {
              return [ch._id, undefined] as const;
            }
          })
        );
        if (!active) return;
        setLastByChannelId((prev) => {
          const nextMap = { ...prev };
          for (const [id, m] of pairs) nextMap[id] = m;
          return nextMap;
        });
      } catch (e: any) {
        if (!active) return;
        setError(typeof e?.message === "string" ? e.message : "Failed to load channels");
        setChannels([]);
      } finally {
        if (active) setIsBusy(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [workspaceId]);

  async function openNewDm(): Promise<void> {
    if (!workspaceId) return;
    setDmError(null);
    setDmBusy(true);
    try {
      const members = await listWorkspaceMembers(workspaceId);
      setDmMembers(members.filter((m) => m.user && m.user._id && m.user._id !== user?._id));
      setIsNewDmOpen(true);
    } catch (e: any) {
      setDmError(typeof e?.message === "string" ? e.message : "Failed to load members");
    } finally {
      setDmBusy(false);
    }
  }

  async function onCreateDmWith(member: WorkspaceMemberDto): Promise<void> {
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
  }

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

  const filteredDms = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return dms;
    return dms.filter((dm) => {
      const name = (dm.name ?? "").toLowerCase();
      const other = (dm.participants?.find((p) => p.userId !== user?._id)?.userId ?? "").toLowerCase();
      return name.includes(q) || other.includes(q);
    });
  }, [dms, search, user?._id]);

  const formatTime = useMemo(() => {
    return (iso?: string): string => {
      if (!iso) return "";
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    };
  }, []);

  const isUnread = useMemo(() => {
    return (channelId: string): boolean => {
      const last = lastByChannelId[channelId];
      if (!last) return false;
      const lastReadIso = lastReadMap[channelId];
      if (!lastReadIso) return true;
      const lr = new Date(lastReadIso).getTime();
      const lm = new Date(last.createdAt).getTime();
      if (Number.isNaN(lr) || Number.isNaN(lm)) return false;
      return lm > lr;
    };
  }, [lastByChannelId, lastReadMap]);

  const getUnreadCount = useMemo(() => {
    return (channelId: string): number => {
      const n = Number(unreadMap[channelId] ?? 0);
      return Number.isFinite(n) && n > 0 ? Math.min(99, Math.floor(n)) : 0;
    };
  }, [unreadMap]);

  const canCreate = !!workspaceId && newName.trim().length >= 2;

  function openCreate(): void {
    setCreateError(null);
    setNewName("");
    setNewDesc("");
    setNewIsPrivate(false);
    setIsCreateOpen(true);
  }

  async function onCreate(): Promise<void> {
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
      setLastReadMapState((prev) => ({ ...prev, [ch._id]: new Date().toISOString() }));
      router.push({ pathname: "/(app)/chat/[channelId]", params: { channelId: ch._id, channelName: ch.name } });
    } catch (e: any) {
      setCreateError(typeof e?.message === "string" ? e.message : "Failed to create channel");
    }
  }

  const list = (
    <View style={{ flex: 1, backgroundColor: Colors.dark.background }}>
      <View
        style={{
          paddingTop: 12,
          paddingHorizontal: 16,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.08)",
          backgroundColor: Colors.dark.background,
        }}
      >
        <Pressable
          onPress={() => setIsWorkspacePickerOpen(true)}
          style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 8, opacity: pressed ? 0.85 : 1 })}
        >
          <Text
            numberOfLines={1}
            style={{ color: Colors.dark.textPrimary, fontSize: 18, fontWeight: "700", flexShrink: 1, minWidth: 0 }}
          >
            {workspaceName}
          </Text>
          <Text style={{ color: Colors.dark.textSecondary, fontSize: 14 }}>▼</Text>
        </Pressable>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <Pressable
            onPress={() => setActiveTab("channels")}
            style={({ pressed }) => ({
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 999,
              backgroundColor:
                activeTab === "channels" ? "rgba(37,211,102,0.25)" : pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
            })}
          >
            <Text style={{ color: Colors.dark.textPrimary, fontWeight: "800" }}>Channels</Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab("dms")}
            style={({ pressed }) => ({
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 999,
              backgroundColor:
                activeTab === "dms" ? "rgba(37,211,102,0.25)" : pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
            })}
          >
            <Text style={{ color: Colors.dark.textPrimary, fontWeight: "800" }}>DMs</Text>
          </Pressable>
        </View>
        <View style={{ marginTop: 12 }}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search"
            placeholderTextColor={Colors.dark.textSecondary}
            style={{
              color: Colors.dark.textPrimary,
              backgroundColor: "rgba(255,255,255,0.06)",
              borderRadius: 16,
              paddingHorizontal: 14,
              paddingVertical: 10,
            }}
          />
        </View>
      </View>

      {error ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <Text style={{ color: Colors.dark.textSecondary }}>{error}</Text>
        </View>
      ) : null}

      <FlatList
        data={activeTab === "channels" ? filteredChannels : (filteredDms as any)}
        keyExtractor={(item) => item._id}
        contentContainerStyle={{ paddingVertical: 8 }}
        refreshing={isBusy}
        onRefresh={() => {
          if (!workspaceId) return;
          setIsBusy(true);
          setError(null);
          listChannels(workspaceId)
            .then(async (next) => {
              setChannels(next);
              const pairs = await Promise.all(
                next.map(async (ch) => {
                  try {
                    const res = await listMessages(ch._id, { limit: 1, offset: 0 });
                    const m = Array.isArray(res.messages) ? res.messages[0] : undefined;
                    return [ch._id, m] as const;
                  } catch {
                    return [ch._id, undefined] as const;
                  }
                })
              );
              setLastByChannelId((prev) => {
                const nextMap = { ...prev };
                for (const [id, m] of pairs) nextMap[id] = m;
                return nextMap;
              });
            })
            .catch((e: any) => setError(typeof e?.message === "string" ? e.message : "Failed to load channels"))
            .finally(() => setIsBusy(false));
        }}
        renderItem={({ item }: any) => (
          <Pressable
            onPress={() => {
              if (activeTab === "channels") {
                const last = lastByChannelId[item._id];
                if (last?.createdAt) {
                  setLastReadMapState((prev) => ({ ...prev, [item._id]: last.createdAt }));
                }

                if (user?._id) {
                  setUnreadMapState((prev) => ({ ...prev, [item._id]: 0 }));
                  clearUnreadCount(user._id, item._id).catch(() => {
                    // ignore
                  });
                }
                router.push({
                  pathname: "/(app)/chat/[channelId]",
                  params: { channelId: item._id, channelName: item.name, lastMessageAt: last?.createdAt ?? "" },
                });
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
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: "rgba(255,255,255,0.08)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: Colors.dark.textPrimary, fontWeight: "800" }}>{activeTab === "channels" ? "#" : "@"}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ color: Colors.dark.textPrimary, fontWeight: "700" }} numberOfLines={1}>
                    {activeTab === "channels" ? String(item.name ?? "") : String(item.name ?? "Direct message")}
                  </Text>
                  <Text style={{ color: Colors.dark.textSecondary, fontSize: 12 }}>
                    {activeTab === "channels" ? formatTime(lastByChannelId[item._id]?.createdAt) : formatTime(item.lastMessageAt)}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                  <Text style={{ color: Colors.dark.textSecondary, flex: 1 }} numberOfLines={1}>
                    {activeTab === "channels" ? lastByChannelId[item._id]?.text ?? item.description ?? "" : "Tap to open"}
                  </Text>
                  <View
                    style={{
                      minWidth: 22,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor:
                        activeTab === "channels" && getUnreadCount(item._id) > 0 ? "rgba(37,211,102,1)" : "rgba(37,211,102,0.0)",
                      alignItems: "center",
                      justifyContent: "center",
                      marginLeft: 12,
                    }}
                  >
                    {activeTab === "channels" && getUnreadCount(item._id) > 0 ? (
                      <Text style={{ color: "#0b141a", fontWeight: "900", fontSize: 12 }}>
                        {getUnreadCount(item._id) > 99 ? "99+" : String(getUnreadCount(item._id))}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          workspaceId && !isBusy ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 18 }}>
              <Text style={{ color: Colors.dark.textSecondary }}>{search.trim() ? "No results" : "No channels yet"}</Text>
            </View>
          ) : null
        }
      />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: Colors.dark.background, flexDirection: isTwoPane ? "row" : "column" }}>
      <Modal
        transparent
        visible={isWorkspacePickerOpen}
        animationType="fade"
        onRequestClose={() => setIsWorkspacePickerOpen(false)}
      >
        <Pressable
          onPress={() => setIsWorkspacePickerOpen(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 18 }}
        >
          <Pressable
            onPress={() => {
              // keep open
            }}
            style={{ backgroundColor: "#0b141a", borderRadius: 16, padding: 16, width: 520, maxWidth: "100%" as any, marginHorizontal: "auto" as any }}
          >
            <Text style={{ color: Colors.dark.textPrimary, fontSize: 16, fontWeight: "800" }}>Select workspace</Text>
            <Text style={{ color: Colors.dark.textSecondary, marginTop: 6 }}>Choose which workspace to view in Chat</Text>

            <View style={{ marginTop: 12 }}>
              {workspaces.map((w) => (
                <Pressable
                  key={w._id}
                  onPress={() => {
                    void onPickWorkspace(w);
                  }}
                  style={({ pressed }) => ({
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                    borderRadius: 12,
                    backgroundColor:
                      w._id === workspaceId
                        ? "rgba(37,211,102,0.18)"
                        : pressed
                          ? "rgba(255,255,255,0.08)"
                          : "rgba(255,255,255,0.06)",
                    marginBottom: 10,
                    borderWidth: 1,
                    borderColor: w._id === workspaceId ? "rgba(37,211,102,0.5)" : "rgba(255,255,255,0.08)",
                  })}
                >
                  <Text style={{ color: Colors.dark.textPrimary, fontWeight: "800" }} numberOfLines={1}>
                    {w.name}
                  </Text>
                  {w.description ? (
                    <Text style={{ color: Colors.dark.textSecondary, marginTop: 4 }} numberOfLines={2}>
                      {w.description}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal transparent visible={isNewDmOpen} animationType="fade" onRequestClose={() => setIsNewDmOpen(false)}>
        <Pressable
          onPress={() => setIsNewDmOpen(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 18 }}
        >
          <Pressable
            onPress={() => {
              // keep open
            }}
            style={{
              backgroundColor: "#0b141a",
              borderRadius: 16,
              padding: 16,
              width: 520,
              maxWidth: "100%" as any,
              marginHorizontal: "auto" as any,
              maxHeight: "80%" as any,
            }}
          >
            <Text style={{ color: Colors.dark.textPrimary, fontSize: 16, fontWeight: "800" }}>New DM</Text>
            <Text style={{ color: Colors.dark.textSecondary, marginTop: 6 }}>Pick a member</Text>
            {dmError ? <Text style={{ color: Colors.dark.textSecondary, marginTop: 10 }}>{dmError}</Text> : null}

            <View style={{ marginTop: 12 }}>
              <FlatList
                data={dmMembers}
                keyExtractor={(m) => m.userId}
                style={{ maxHeight: 420 }}
                renderItem={({ item }) => (
                  <Pressable
                    disabled={dmBusy}
                    onPress={() => {
                      void onCreateDmWith(item);
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
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal transparent visible={isCreateOpen} animationType="fade" onRequestClose={() => setIsCreateOpen(false)}>
        <Pressable
          onPress={() => setIsCreateOpen(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 18 }}
        >
          <Pressable
            onPress={() => {
              // keep open
            }}
            style={{ backgroundColor: "#0b141a", borderRadius: 16, padding: 16, width: 520, maxWidth: "100%" as any, marginHorizontal: "auto" as any }}
          >
            <Text style={{ color: Colors.dark.textPrimary, fontSize: 16, fontWeight: "800" }}>New Channel</Text>
            <Text style={{ color: Colors.dark.textSecondary, marginTop: 6 }}>Create a channel in this workspace</Text>

            {createError ? (
              <Text style={{ color: Colors.dark.textSecondary, marginTop: 10 }}>{createError}</Text>
            ) : null}

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
          </Pressable>
        </Pressable>
      </Modal>

      <View style={{ flex: isTwoPane ? 0 : 1, width: isTwoPane ? 420 : undefined, minWidth: isTwoPane ? 360 : undefined }}>
        {list}
      </View>

      {isTwoPane ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", borderLeftWidth: 1, borderLeftColor: "rgba(255,255,255,0.08)" }}>
          <Text style={{ color: Colors.dark.textSecondary }}>Select a chat</Text>
        </View>
      ) : null}

      <Pressable
        onPress={() => {
          if (activeTab === "channels") {
            openCreate();
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
          shadowOpacity: 0.25,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 6 },
        })}
      >
        <Text style={{ color: "white", fontSize: 28, fontWeight: "900", marginTop: -2 }}>+</Text>
      </Pressable>
    </View>
  );
}

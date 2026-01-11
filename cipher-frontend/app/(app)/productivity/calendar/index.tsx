import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../../../utils/colors";
import { PremiumScreen } from "../../../../components/PremiumScreen";
import { getActiveWorkspaceId } from "../../../../services/workspaceSelection";
import { listTasks, type TaskDto } from "../../../../services/tasks";

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function CalendarScreen(): JSX.Element {
  const today = useMemo(() => new Date(), []);
  const todayYmd = useMemo(() => toYmd(today), [today]);
  const tomorrowYmd = useMemo(() => {
    const t = new Date(today);
    t.setDate(t.getDate() + 1);
    return toYmd(t);
  }, [today]);

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskDto[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      const id = await getActiveWorkspaceId();
      if (active) setWorkspaceId(id);
    })();
    return () => {
      active = false;
    };
  }, []);

  const reload = useCallback(async () => {
    if (!workspaceId) return;
    setBusy(true);
    setError(null);
    try {
      const t = await listTasks(workspaceId);
      setTasks(t);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to load tasks");
    } finally {
      setBusy(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const { dueToday, dueTomorrow, noDueDate } = useMemo(() => {
    const dueToday: TaskDto[] = [];
    const dueTomorrow: TaskDto[] = [];
    const noDueDate: TaskDto[] = [];

    for (const t of tasks) {
      if (t.status === "done") continue;
      if (!t.dueAt) {
        noDueDate.push(t);
        continue;
      }
      const d = new Date(String(t.dueAt));
      if (Number.isNaN(d.getTime())) {
        noDueDate.push(t);
        continue;
      }
      const ymd = toYmd(d);
      if (ymd === todayYmd) dueToday.push(t);
      else if (ymd === tomorrowYmd) dueTomorrow.push(t);
      else noDueDate.push(t);
    }

    return { dueToday, dueTomorrow, noDueDate };
  }, [tasks, todayYmd, tomorrowYmd]);

  return (
    <PremiumScreen padded={false} topPadding={0}>
      <View style={{ paddingTop: 56, paddingHorizontal: 16, paddingBottom: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => ({ padding: 10, opacity: pressed ? 0.7 : 1 })}>
          <Ionicons name="chevron-back" size={22} color={Colors.dark.textPrimary} />
        </Pressable>
        <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900", fontSize: 18 }}>Calendar</Text>
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
        <View style={{ borderRadius: 16, padding: 14, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900" }}>Plan Today</Text>
            <Pressable disabled={busy} onPress={() => void reload()} style={({ pressed }) => ({ padding: 10, opacity: busy ? 0.5 : pressed ? 0.7 : 1 })}>
              <Ionicons name="refresh" size={18} color={Colors.dark.textPrimary} />
            </Pressable>
          </View>
          <Text style={{ color: Colors.dark.textSecondary, marginTop: 6 }}>Due today: {dueToday.length} • tomorrow: {dueTomorrow.length}</Text>
          {!workspaceId ? <Text style={{ color: Colors.dark.textSecondary, marginTop: 10 }}>No active workspace selected</Text> : null}
          {error ? <Text style={{ color: Colors.dark.textSecondary, marginTop: 10 }}>{error}</Text> : null}
          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <Pressable onPress={() => router.push("/(app)/productivity/tasks" as any)} style={({ pressed }) => ({ flex: 1, paddingVertical: 12, borderRadius: 14, backgroundColor: pressed ? "rgba(37,211,102,0.7)" : "rgba(37,211,102,1)", alignItems: "center" })}>
              <Text style={{ color: "white", fontWeight: "900" }}>Open Tasks</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/(app)/productivity/focus-timer" as any)} style={({ pressed }) => ({ flex: 1, paddingVertical: 12, borderRadius: 14, backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)", alignItems: "center" })}>
              <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900" }}>Focus</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <FlatList
        style={{ flex: 1, marginTop: 10 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 18 }}
        data={[
          { key: "today", title: `Today (${dueToday.length})`, items: dueToday },
          { key: "tomorrow", title: `Tomorrow (${dueTomorrow.length})`, items: dueTomorrow },
          { key: "later", title: `No / other due date (${noDueDate.length})`, items: noDueDate.slice(0, 10) },
        ]}
        keyExtractor={(it) => it.key}
        renderItem={({ item }) => (
          <View style={{ marginBottom: 12, borderRadius: 16, padding: 14, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
            <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900" }}>{item.title}</Text>
            {item.items.length === 0 ? (
              <Text style={{ color: Colors.dark.textSecondary, marginTop: 8 }}>Nothing here</Text>
            ) : (
              item.items.map((t) => (
                <Text key={t._id} style={{ color: Colors.dark.textSecondary, marginTop: 8 }} numberOfLines={1}>
                  - {t.title}
                </Text>
              ))
            )}
          </View>
        )}
      />
    </PremiumScreen>
  );
}

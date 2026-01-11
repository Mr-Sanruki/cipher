import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../../../utils/colors";
import { PremiumScreen } from "../../../../components/PremiumScreen";
import { getActiveWorkspaceId } from "../../../../services/workspaceSelection";
import { listTasks, type TaskDto } from "../../../../services/tasks";
import { listNotes, type NoteDto } from "../../../../services/notes";
import { listHabits, type HabitDto } from "../../../../services/habits";
import { listFocusSessions, type FocusSessionDto } from "../../../../services/focusSessions";

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function DashboardScreen(): JSX.Element {
  const today = useMemo(() => toYmd(new Date()), []);

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [tasks, setTasks] = useState<TaskDto[]>([]);
  const [notes, setNotes] = useState<NoteDto[]>([]);
  const [habits, setHabits] = useState<HabitDto[]>([]);
  const [sessions, setSessions] = useState<FocusSessionDto[]>([]);

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
      const [t, n, h, s] = await Promise.all([
        listTasks(workspaceId),
        listNotes({ workspaceId }),
        listHabits(workspaceId),
        listFocusSessions(workspaceId),
      ]);
      setTasks(t);
      setNotes(n);
      setHabits(h);
      setSessions(s);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to load dashboard");
    } finally {
      setBusy(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const stats = useMemo(() => {
    const totalTasks = tasks.length;
    const doneTasks = tasks.filter((t) => t.status === "done").length;
    const openTasks = totalTasks - doneTasks;

    const dueToday = tasks.filter((t) => {
      if (!t.dueAt) return false;
      const d = new Date(String(t.dueAt));
      return !Number.isNaN(d.getTime()) && toYmd(d) === today;
    }).length;

    const notesCount = notes.length;

    const habitsDoneToday = habits.filter((h) => (Array.isArray(h.logs) ? h.logs : []).some((l) => l.date === today && l.completed)).length;

    const focusMinutesToday = sessions
      .filter((s) => {
        const d = new Date(String(s.startedAt));
        return !Number.isNaN(d.getTime()) && toYmd(d) === today && (s.mode ?? "focus") === "focus";
      })
      .reduce((sum, s) => sum + Math.round(Number(s.durationSeconds ?? 0) / 60), 0);

    return { totalTasks, openTasks, doneTasks, dueToday, notesCount, habitsDoneToday, focusMinutesToday };
  }, [tasks, notes, habits, sessions, today]);

  return (
    <PremiumScreen padded={false} topPadding={0}>
      <View style={{ paddingTop: 56, paddingHorizontal: 16, paddingBottom: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => ({ padding: 10, opacity: pressed ? 0.7 : 1 })}>
          <Ionicons name="chevron-back" size={22} color={Colors.dark.textPrimary} />
        </Pressable>
        <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900", fontSize: 18 }}>Dashboard</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18 }}>
        <View style={{ borderRadius: 16, padding: 14, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900" }}>Today</Text>
            <Pressable disabled={busy} onPress={() => void reload()} style={({ pressed }) => ({ padding: 10, opacity: busy ? 0.5 : pressed ? 0.7 : 1 })}>
              <Ionicons name="refresh" size={18} color={Colors.dark.textPrimary} />
            </Pressable>
          </View>

          {!workspaceId ? <Text style={{ color: Colors.dark.textSecondary, marginTop: 10 }}>No active workspace selected</Text> : null}
          {error ? <Text style={{ color: Colors.dark.textSecondary, marginTop: 10 }}>{error}</Text> : null}

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
            <View style={{ flexGrow: 1, flexBasis: "48%", borderRadius: 14, padding: 12, backgroundColor: "rgba(0,0,0,0.18)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
              <Text style={{ color: Colors.dark.textSecondary }}>Open tasks</Text>
              <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900", fontSize: 22, marginTop: 6 }}>{stats.openTasks}</Text>
            </View>
            <View style={{ flexGrow: 1, flexBasis: "48%", borderRadius: 14, padding: 12, backgroundColor: "rgba(0,0,0,0.18)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
              <Text style={{ color: Colors.dark.textSecondary }}>Due today</Text>
              <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900", fontSize: 22, marginTop: 6 }}>{stats.dueToday}</Text>
            </View>
            <View style={{ flexGrow: 1, flexBasis: "48%", borderRadius: 14, padding: 12, backgroundColor: "rgba(0,0,0,0.18)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
              <Text style={{ color: Colors.dark.textSecondary }}>Focus minutes</Text>
              <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900", fontSize: 22, marginTop: 6 }}>{stats.focusMinutesToday}</Text>
            </View>
            <View style={{ flexGrow: 1, flexBasis: "48%", borderRadius: 14, padding: 12, backgroundColor: "rgba(0,0,0,0.18)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
              <Text style={{ color: Colors.dark.textSecondary }}>Habits done</Text>
              <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900", fontSize: 22, marginTop: 6 }}>{stats.habitsDoneToday}</Text>
            </View>
            <View style={{ flexGrow: 1, flexBasis: "48%", borderRadius: 14, padding: 12, backgroundColor: "rgba(0,0,0,0.18)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
              <Text style={{ color: Colors.dark.textSecondary }}>Notes</Text>
              <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900", fontSize: 22, marginTop: 6 }}>{stats.notesCount}</Text>
            </View>
            <View style={{ flexGrow: 1, flexBasis: "48%", borderRadius: 14, padding: 12, backgroundColor: "rgba(0,0,0,0.18)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
              <Text style={{ color: Colors.dark.textSecondary }}>Tasks done</Text>
              <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900", fontSize: 22, marginTop: 6 }}>{stats.doneTasks}</Text>
            </View>
          </View>
        </View>

        <View style={{ marginTop: 12, borderRadius: 16, padding: 14, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
          <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900" }}>Quick Actions</Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <Pressable onPress={() => router.push("/(app)/productivity/tasks" as any)} style={({ pressed }) => ({ flex: 1, paddingVertical: 12, borderRadius: 14, backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)", alignItems: "center" })}>
              <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900" }}>Tasks</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/(app)/productivity/focus-timer" as any)} style={({ pressed }) => ({ flex: 1, paddingVertical: 12, borderRadius: 14, backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)", alignItems: "center" })}>
              <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900" }}>Focus</Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <Pressable onPress={() => router.push("/(app)/productivity/habit-tracker" as any)} style={({ pressed }) => ({ flex: 1, paddingVertical: 12, borderRadius: 14, backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)", alignItems: "center" })}>
              <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900" }}>Habits</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/(app)/productivity/quick-notes" as any)} style={({ pressed }) => ({ flex: 1, paddingVertical: 12, borderRadius: 14, backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)", alignItems: "center" })}>
              <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900" }}>Notes</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </PremiumScreen>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../../../utils/colors";
import { PremiumScreen } from "../../../../components/PremiumScreen";
import { getActiveWorkspaceId } from "../../../../services/workspaceSelection";
import { createHabit, deleteHabit, listHabits, updateHabit, type HabitDto } from "../../../../services/habits";

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function computeStreak(logDates: Set<string>, todayYmd: string): number {
  let streak = 0;
  const base = new Date(todayYmd + "T00:00:00.000Z");
  for (let i = 0; i < 365; i++) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - i);
    const ymd = toYmd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())));
    if (logDates.has(ymd)) {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}

export default function HabitTrackerScreen(): JSX.Element {
  const today = useMemo(() => toYmd(new Date()), []);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [habits, setHabits] = useState<HabitDto[]>([]);
  const [name, setName] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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
      const next = await listHabits(workspaceId);
      setHabits(next);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to load habits");
    } finally {
      setBusy(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onCreate = useCallback(async () => {
    if (!workspaceId) {
      setError("No active workspace selected");
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createHabit({ workspaceId, name: trimmed });
      setHabits((prev) => [created, ...prev]);
      setName("");
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to create habit");
    } finally {
      setBusy(false);
    }
  }, [workspaceId, name]);

  const toggleToday = useCallback(
    async (h: HabitDto) => {
      const logs = Array.isArray(h.logs) ? h.logs : [];
      const hasToday = logs.some((l) => l.date === today && l.completed);
      const optimistic: HabitDto = {
        ...h,
        logs: hasToday ? logs.filter((l) => l.date !== today) : [...logs.filter((l) => l.date !== today), { date: today, completed: true }],
      };
      setHabits((prev) => prev.map((x) => (x._id === h._id ? optimistic : x)));
      try {
        const updated = await updateHabit(h._id, { toggleDate: today, completed: !hasToday });
        setHabits((prev) => prev.map((x) => (x._id === updated._id ? updated : x)));
      } catch (e: any) {
        setError(typeof e?.message === "string" ? e.message : "Failed to update habit");
        setHabits((prev) => prev.map((x) => (x._id === h._id ? h : x)));
      }
    },
    [today]
  );

  const onRemove = useCallback(async (h: HabitDto) => {
    setHabits((prev) => prev.filter((x) => x._id !== h._id));
    try {
      await deleteHabit(h._id);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to delete habit");
      setHabits((prev) => [h, ...prev]);
    }
  }, []);

  return (
    <PremiumScreen padded={false} topPadding={0}>
      <View style={{ paddingTop: 56, paddingHorizontal: 16, paddingBottom: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => ({ padding: 10, opacity: pressed ? 0.7 : 1 })}>
          <Ionicons name="chevron-back" size={22} color={Colors.dark.textPrimary} />
        </Pressable>
        <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900", fontSize: 18 }}>Habit Tracker</Text>
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
        <View style={{ borderRadius: 16, padding: 12, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="New habit (e.g. Drink water)"
            placeholderTextColor={Colors.dark.textSecondary}
            style={{ color: Colors.dark.textPrimary, paddingHorizontal: 8, paddingVertical: 10 }}
          />
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <Pressable
              disabled={busy || !name.trim()}
              onPress={() => void onCreate()}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 12,
                borderRadius: 14,
                backgroundColor: busy || !name.trim() ? "rgba(37,211,102,0.25)" : pressed ? "rgba(37,211,102,0.7)" : "rgba(37,211,102,1)",
                alignItems: "center",
              })}
            >
              <Text style={{ color: "white", fontWeight: "900" }}>{busy ? "Please wait..." : "Add"}</Text>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={() => void reload()}
              style={({ pressed }) => ({
                paddingHorizontal: 14,
                borderRadius: 14,
                backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
                alignItems: "center",
                justifyContent: "center",
                opacity: busy ? 0.6 : 1,
              })}
            >
              <Ionicons name="refresh" size={18} color={Colors.dark.textPrimary} />
            </Pressable>
          </View>
        </View>
        {error ? <Text style={{ color: Colors.dark.textSecondary, marginTop: 10 }}>{error}</Text> : null}
        {!workspaceId ? <Text style={{ color: Colors.dark.textSecondary, marginTop: 10 }}>No active workspace selected</Text> : null}
      </View>

      <FlatList
        style={{ flex: 1, marginTop: 10 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 18 }}
        data={habits}
        keyExtractor={(it) => it._id}
        renderItem={({ item }) => {
          const logDates = new Set((Array.isArray(item.logs) ? item.logs : []).filter((l) => l.completed).map((l) => l.date));
          const doneToday = logDates.has(today);
          const streak = computeStreak(logDates, today);
          return (
            <View style={{ paddingVertical: 12, paddingHorizontal: 12, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", marginBottom: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900" }} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={{ color: Colors.dark.textSecondary, marginTop: 6 }}>streak: {streak} day{streak === 1 ? "" : "s"}</Text>
                </View>

                <Pressable
                  onPress={() => void toggleToday(item)}
                  style={({ pressed }) => ({
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 14,
                    backgroundColor: doneToday ? "rgba(37,211,102,1)" : pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
                    borderWidth: 1,
                    borderColor: doneToday ? "rgba(37,211,102,0.6)" : "rgba(255,255,255,0.08)",
                  })}
                >
                  <Text style={{ color: doneToday ? "#0b141a" : Colors.dark.textPrimary, fontWeight: "900" }}>{doneToday ? "Done" : "Mark"}</Text>
                </Pressable>

                <Pressable onPress={() => void onRemove(item)} style={({ pressed }) => ({ padding: 8, opacity: pressed ? 0.7 : 1 })}>
                  <Ionicons name="trash" size={18} color={Colors.dark.textSecondary} />
                </Pressable>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={!busy ? <Text style={{ color: Colors.dark.textSecondary, paddingTop: 30, textAlign: "center" }}>No habits yet</Text> : null}
      />
    </PremiumScreen>
  );
}

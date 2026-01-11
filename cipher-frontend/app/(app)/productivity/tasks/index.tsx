import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../../../utils/colors";
import { PremiumScreen } from "../../../../components/PremiumScreen";
import { getActiveWorkspaceId } from "../../../../services/workspaceSelection";
import { createTask, deleteTask, listTasks, updateTask, type TaskDto } from "../../../../services/tasks";

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function parseQuickAdd(inputRaw: string): {
  title: string;
  priority?: "low" | "medium" | "high";
  dueAt?: string | null;
} {
  const input = inputRaw.trim();
  const lower = input.toLowerCase();
  const priority: "low" | "medium" | "high" | undefined =
    lower.includes(" high") || lower.endsWith(" high") || lower.startsWith("high ")
      ? "high"
      : lower.includes(" low") || lower.endsWith(" low") || lower.startsWith("low ")
        ? "low"
        : lower.includes(" medium") || lower.endsWith(" medium") || lower.startsWith("medium ")
          ? "medium"
          : undefined;

  let dueAt: string | null | undefined;
  if (/(^|\s)tomorrow(\s|$)/i.test(input)) {
    const t = startOfDay(new Date());
    t.setDate(t.getDate() + 1);
    dueAt = t.toISOString();
  } else if (/(^|\s)today(\s|$)/i.test(input)) {
    dueAt = startOfDay(new Date()).toISOString();
  }

  const cleaned = input
    .replace(/(^|\s)(today|tomorrow)(\s|$)/gi, " ")
    .replace(/(^|\s)(high|medium|low)(\s|$)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { title: cleaned || input, priority, dueAt };
}

export default function TasksScreen(): JSX.Element {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskDto[]>([]);
  const [quickAdd, setQuickAdd] = useState<string>("");

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
      const next = await listTasks(workspaceId);
      setTasks(next);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to load tasks");
    } finally {
      setBusy(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const ordered = useMemo(() => {
    const next = [...tasks];
    next.sort((a, b) => (Number(a.order ?? 0) - Number(b.order ?? 0)) || String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
    return next;
  }, [tasks]);

  const onCreate = useCallback(async () => {
    if (!workspaceId) {
      setError("No active workspace selected");
      return;
    }
    const parsed = parseQuickAdd(quickAdd);
    if (!parsed.title.trim()) return;

    setBusy(true);
    setError(null);
    try {
      const maxOrder = ordered.reduce((m, t) => Math.max(m, Number(t.order ?? 0)), 0);
      const created = await createTask({
        workspaceId,
        title: parsed.title,
        priority: parsed.priority,
        dueAt: parsed.dueAt,
        order: maxOrder + 10,
      });
      setTasks((prev) => [...prev, created]);
      setQuickAdd("");
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to create task");
    } finally {
      setBusy(false);
    }
  }, [workspaceId, quickAdd, ordered]);

  const onToggleDone = useCallback(async (t: TaskDto) => {
    if (!t?._id) return;
    const nextStatus = t.status === "done" ? "todo" : "done";
    setTasks((prev) => prev.map((x) => (x._id === t._id ? { ...x, status: nextStatus } : x)));
    try {
      const updated = await updateTask(t._id, { status: nextStatus });
      setTasks((prev) => prev.map((x) => (x._id === t._id ? updated : x)));
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to update task");
      setTasks((prev) => prev.map((x) => (x._id === t._id ? t : x)));
    }
  }, []);

  const onRemove = useCallback(async (t: TaskDto) => {
    if (!t?._id) return;
    setTasks((prev) => prev.filter((x) => x._id !== t._id));
    try {
      await deleteTask(t._id);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to delete task");
      setTasks((prev) => [...prev, t]);
    }
  }, []);

  const swapOrder = useCallback(async (a: TaskDto, b: TaskDto) => {
    if (!a?._id || !b?._id) return;
    const ao = Number(a.order ?? 0);
    const bo = Number(b.order ?? 0);
    setTasks((prev) => prev.map((x) => (x._id === a._id ? { ...x, order: bo } : x._id === b._id ? { ...x, order: ao } : x)));
    try {
      const [ua, ub] = await Promise.all([updateTask(a._id, { order: bo }), updateTask(b._id, { order: ao })]);
      setTasks((prev) => prev.map((x) => (x._id === ua._id ? ua : x._id === ub._id ? ub : x)));
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to reorder");
      setTasks((prev) => prev.map((x) => (x._id === a._id ? a : x._id === b._id ? b : x)));
    }
  }, []);

  return (
    <PremiumScreen padded={false} topPadding={0}>
      <View style={{ paddingTop: 56, paddingHorizontal: 16, paddingBottom: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => ({ padding: 10, opacity: pressed ? 0.7 : 1 })}>
          <Ionicons name="chevron-back" size={22} color={Colors.dark.textPrimary} />
        </Pressable>
        <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900", fontSize: 18 }}>Tasks</Text>
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
        <View style={{ borderRadius: 16, padding: 12, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
          <TextInput
            value={quickAdd}
            onChangeText={setQuickAdd}
            placeholder="Quick add (e.g. API tomorrow high)"
            placeholderTextColor={Colors.dark.textSecondary}
            style={{ color: Colors.dark.textPrimary, paddingHorizontal: 8, paddingVertical: 10 }}
          />
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <Pressable
              disabled={busy || !quickAdd.trim()}
              onPress={() => void onCreate()}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 12,
                borderRadius: 14,
                backgroundColor: busy || !quickAdd.trim() ? "rgba(37,211,102,0.25)" : pressed ? "rgba(37,211,102,0.7)" : "rgba(37,211,102,1)",
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
        data={ordered}
        keyExtractor={(it) => it._id}
        renderItem={({ item, index }) => {
          const isDone = item.status === "done";
          const up = index > 0 ? ordered[index - 1] : null;
          const down = index < ordered.length - 1 ? ordered[index + 1] : null;
          const pri = item.priority ?? "medium";
          const priColor = pri === "high" ? "rgba(231,76,60,0.95)" : pri === "low" ? "rgba(52,183,241,0.95)" : "rgba(241,196,15,0.95)";
          return (
            <View
              style={{
                paddingVertical: 12,
                paddingHorizontal: 12,
                borderRadius: 16,
                backgroundColor: "rgba(255,255,255,0.06)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
                marginBottom: 10,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <Pressable
                  onPress={() => void onToggleDone(item)}
                  style={({ pressed }) => ({
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.2)",
                    backgroundColor: isDone ? "rgba(37,211,102,1)" : "transparent",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ color: "#0b141a", fontWeight: "900" }}>{isDone ? "✓" : ""}</Text>
                </Pressable>

                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: Colors.dark.textPrimary,
                      fontWeight: "900",
                      textDecorationLine: isDone ? "line-through" : "none",
                      opacity: isDone ? 0.6 : 1,
                    }}
                    numberOfLines={2}
                  >
                    {item.title}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
                    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.2)" }}>
                      <Text style={{ color: Colors.dark.textSecondary, fontWeight: "800" }}>{(item.status ?? "todo").toUpperCase()}</Text>
                    </View>
                    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.2)" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: priColor }} />
                        <Text style={{ color: Colors.dark.textSecondary, fontWeight: "800" }}>{pri.toUpperCase()}</Text>
                      </View>
                    </View>
                  </View>
                </View>

                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Pressable
                    disabled={!up}
                    onPress={() => {
                      if (up) void swapOrder(item, up);
                    }}
                    style={({ pressed }) => ({ padding: 8, opacity: !up ? 0.25 : pressed ? 0.7 : 1 })}
                  >
                    <Ionicons name="chevron-up" size={18} color={Colors.dark.textPrimary} />
                  </Pressable>
                  <Pressable
                    disabled={!down}
                    onPress={() => {
                      if (down) void swapOrder(item, down);
                    }}
                    style={({ pressed }) => ({ padding: 8, opacity: !down ? 0.25 : pressed ? 0.7 : 1 })}
                  >
                    <Ionicons name="chevron-down" size={18} color={Colors.dark.textPrimary} />
                  </Pressable>
                  <Pressable onPress={() => void onRemove(item)} style={({ pressed }) => ({ padding: 8, opacity: pressed ? 0.7 : 1 })}>
                    <Ionicons name="trash" size={18} color={Colors.dark.textSecondary} />
                  </Pressable>
                </View>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={!busy ? <Text style={{ color: Colors.dark.textSecondary, paddingTop: 30, textAlign: "center" }}>No tasks yet</Text> : null}
      />
    </PremiumScreen>
  );
}

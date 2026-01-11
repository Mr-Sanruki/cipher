import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../../../utils/colors";
import { PremiumScreen } from "../../../../components/PremiumScreen";
import { getActiveWorkspaceId } from "../../../../services/workspaceSelection";
import { createFocusSession, listFocusSessions, type FocusSessionDto } from "../../../../services/focusSessions";

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function FocusTimerScreen(): JSX.Element {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [mode, setMode] = useState<"focus" | "break">("focus");
  const [running, setRunning] = useState<boolean>(false);
  const [secondsLeft, setSecondsLeft] = useState<number>(25 * 60);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<FocusSessionDto[]>([]);
  const startRef = useRef<Date | null>(null);

  const targetSeconds = useMemo(() => (mode === "focus" ? 25 * 60 : 5 * 60), [mode]);

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

  const reloadRecent = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const list = await listFocusSessions(workspaceId);
      setRecent(list.slice(0, 10));
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to load sessions");
    }
  }, [workspaceId]);

  useEffect(() => {
    void reloadRecent();
  }, [reloadRecent]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (!running) return;
    if (secondsLeft > 0) return;
    setRunning(false);
  }, [secondsLeft, running]);

  const onSwitchMode = useCallback(
    (next: "focus" | "break") => {
      if (running) return;
      setMode(next);
      setSecondsLeft(next === "focus" ? 25 * 60 : 5 * 60);
    },
    [running]
  );

  const onReset = useCallback(() => {
    if (running) return;
    setSecondsLeft(targetSeconds);
  }, [running, targetSeconds]);

  const onToggle = useCallback(async () => {
    setError(null);

    if (!workspaceId) {
      setError("No active workspace selected");
      return;
    }

    if (!running) {
      startRef.current = new Date();
      setRunning(true);
      return;
    }

    const startedAt = startRef.current ?? new Date();
    const endedAt = new Date();
    const durationSeconds = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
    setRunning(false);
    startRef.current = null;

    try {
      await createFocusSession({
        workspaceId,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationSeconds,
        mode,
      });
      await reloadRecent();
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to save session");
    }
  }, [workspaceId, running, mode, reloadRecent]);

  return (
    <PremiumScreen padded={false} topPadding={0}>
      <View style={{ paddingTop: 56, paddingHorizontal: 16, paddingBottom: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => ({ padding: 10, opacity: pressed ? 0.7 : 1 })}>
          <Ionicons name="chevron-back" size={22} color={Colors.dark.textPrimary} />
        </Pressable>
        <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900", fontSize: 18 }}>Focus Timer</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18 }}>
        <View style={{ borderRadius: 16, padding: 14, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
          <Text style={{ color: Colors.dark.textSecondary }}>Pomodoro 25/5 • saves sessions on Stop</Text>

          <View style={{ marginTop: 12, alignItems: "center" }}>
            <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900", fontSize: 48 }}>{formatClock(secondsLeft)}</Text>
            <Text style={{ color: Colors.dark.textSecondary, marginTop: 6 }}>{mode.toUpperCase()}</Text>
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
            <Pressable
              disabled={running}
              onPress={() => onSwitchMode("focus")}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 12,
                borderRadius: 14,
                backgroundColor: mode === "focus" ? "rgba(37,211,102,0.22)" : pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
                borderWidth: 1,
                borderColor: mode === "focus" ? "rgba(37,211,102,0.35)" : "rgba(255,255,255,0.08)",
                alignItems: "center",
                opacity: running ? 0.6 : 1,
              })}
            >
              <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900" }}>Focus</Text>
            </Pressable>
            <Pressable
              disabled={running}
              onPress={() => onSwitchMode("break")}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 12,
                borderRadius: 14,
                backgroundColor: mode === "break" ? "rgba(37,211,102,0.22)" : pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
                borderWidth: 1,
                borderColor: mode === "break" ? "rgba(37,211,102,0.35)" : "rgba(255,255,255,0.08)",
                alignItems: "center",
                opacity: running ? 0.6 : 1,
              })}
            >
              <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900" }}>Break</Text>
            </Pressable>
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <Pressable
              disabled={!workspaceId}
              onPress={() => void onToggle()}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 12,
                borderRadius: 14,
                backgroundColor: pressed ? "rgba(37,211,102,0.7)" : "rgba(37,211,102,1)",
                alignItems: "center",
                opacity: !workspaceId ? 0.6 : 1,
              })}
            >
              <Text style={{ color: "white", fontWeight: "900" }}>{running ? "Stop" : "Start"}</Text>
            </Pressable>
            <Pressable
              disabled={running}
              onPress={onReset}
              style={({ pressed }) => ({
                paddingHorizontal: 14,
                borderRadius: 14,
                backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
                alignItems: "center",
                justifyContent: "center",
                opacity: running ? 0.6 : 1,
              })}
            >
              <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900" }}>Reset</Text>
            </Pressable>
          </View>

          {!workspaceId ? <Text style={{ color: Colors.dark.textSecondary, marginTop: 10 }}>No active workspace selected</Text> : null}
          {error ? <Text style={{ color: Colors.dark.textSecondary, marginTop: 10 }}>{error}</Text> : null}
        </View>

        <View style={{ marginTop: 12, borderRadius: 16, padding: 14, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900" }}>Recent Sessions</Text>
            <Pressable onPress={() => void reloadRecent()} style={({ pressed }) => ({ padding: 10, opacity: pressed ? 0.7 : 1 })}>
              <Ionicons name="refresh" size={18} color={Colors.dark.textPrimary} />
            </Pressable>
          </View>
          {recent.length === 0 ? (
            <Text style={{ color: Colors.dark.textSecondary, marginTop: 10 }}>No sessions yet</Text>
          ) : (
            recent.map((s) => (
              <Text key={s._id} style={{ color: Colors.dark.textSecondary, marginTop: 8 }}>
                {String(s.mode ?? "focus").toUpperCase()} • {Math.round(Number(s.durationSeconds ?? 0) / 60)} min
              </Text>
            ))
          )}
        </View>
      </ScrollView>
    </PremiumScreen>
  );
}

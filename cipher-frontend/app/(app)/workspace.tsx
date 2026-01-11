import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Colors } from "../../utils/colors";
import { PremiumScreen } from "../../components/PremiumScreen";
import { FadeIn } from "../../components/FadeIn";
import { PremiumButton } from "../../components/PremiumButton";
import type { WorkspaceDto } from "../../types";
import { createWorkspace, joinWorkspace, listWorkspaces } from "../../services/workspaces";
import { getActiveWorkspaceId, setActiveWorkspaceId } from "../../services/workspaceSelection";

export default function WorkspaceScreen(): JSX.Element {
  const [workspaces, setWorkspaces] = useState<WorkspaceDto[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);

    try {
      const ws = await listWorkspaces();
      setWorkspaces(ws);

      const saved = await getActiveWorkspaceId();
      const selected = ws.find((w) => w._id === saved) ?? ws[0] ?? null;
      const nextId = selected?._id ?? null;
      setActiveId(nextId);

      if (nextId) {
        await setActiveWorkspaceId(nextId);
      }
    } catch (e) {
      setError(typeof (e as any)?.message === "string" ? (e as any).message : "Failed to load workspaces");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeWorkspace = useMemo(() => workspaces.find((w) => w._id === activeId) ?? null, [activeId, workspaces]);

  const selectWorkspace = useCallback(async (workspaceId: string) => {
    setActiveId(workspaceId);
    await setActiveWorkspaceId(workspaceId);
    router.replace("/(app)/chat");
  }, []);

  const onCreate = useCallback(async () => {
    const name = createName.trim();
    const description = createDescription.trim();
    if (name.length < 2) {
      setError("Workspace name is required");
      return;
    }

    setBusy(true);
    setError(null);
    setCreatedCode(null);

    try {
      const res = await createWorkspace({ name, description: description ? description : undefined });
      setCreatedCode(res.verificationCode);
      await setActiveWorkspaceId(res.workspace._id);
      setActiveId(res.workspace._id);
      setCreateName("");
      setCreateDescription("");
      await load();
    } catch (e) {
      setError(typeof (e as any)?.message === "string" ? (e as any).message : "Failed to create workspace");
    } finally {
      setBusy(false);
    }
  }, [createDescription, createName, load]);

  const onJoin = useCallback(async () => {
    const code = joinCode.trim();
    if (!code) {
      setError("Verification code is required");
      return;
    }

    setBusy(true);
    setError(null);
    setCreatedCode(null);

    try {
      const workspace = await joinWorkspace(code);
      await setActiveWorkspaceId(workspace._id);
      setActiveId(workspace._id);
      setJoinCode("");
      await load();
      router.replace("/(app)/chat");
    } catch (e) {
      setError(typeof (e as any)?.message === "string" ? (e as any).message : "Failed to join workspace");
    } finally {
      setBusy(false);
    }
  }, [joinCode, load]);

  return (
    <PremiumScreen padded={false} topPadding={0}>
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
        <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900", fontSize: 18 }}>Workspace</Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, paddingTop: 16 }}>

        {error ? (
          <Text className="mt-2" style={{ color: Colors.dark.textSecondary }}>
            {error}
          </Text>
        ) : null}

        <FadeIn>
          <View className="mt-6 rounded-2xl border p-4" style={{ backgroundColor: Colors.dark.card, borderColor: Colors.dark.border }}>
          <Text style={{ color: Colors.dark.textSecondary }}>Active workspace</Text>
          <Text className="mt-2 text-base font-semibold" style={{ color: Colors.dark.textPrimary }}>
            {activeWorkspace?.name ?? (loading ? "Loading..." : "None")}
          </Text>
          {activeWorkspace ? (
            <Text className="mt-1 text-xs" style={{ color: Colors.dark.textSecondary }}>
              {(activeWorkspace.memberCount ?? activeWorkspace.members?.length ?? 0).toString()} members | {(activeWorkspace.publicChannelCount ?? 0).toString()} public | {(activeWorkspace.privateChannelCount ?? 0).toString()} private | {(activeWorkspace.messageCount ?? 0).toString()} msgs
            </Text>
          ) : null}
          {activeWorkspace?.verificationCode ? (
            <Pressable
              onPress={() => {
                setJoinCode(activeWorkspace.verificationCode ?? "");
              }}
              className="mt-3 rounded-xl border px-3 py-2"
              style={({ pressed }) => ({
                backgroundColor: pressed ? "rgba(255,255,255,0.08)" : Colors.dark.surface2,
                borderColor: Colors.dark.border,
              })}
              accessibilityRole="button"
              accessibilityLabel="Use active workspace verification code"
            >
              <Text style={{ color: Colors.dark.textSecondary }} className="text-xs">
                Verification code (tap to use)
              </Text>
              <Text selectable className="mt-1 text-base font-semibold" style={{ color: Colors.dark.textPrimary }}>
                {activeWorkspace.verificationCode}
              </Text>
            </Pressable>
          ) : null}
          </View>
        </FadeIn>

        {createdCode ? (
          <FadeIn>
            <View className="mt-3 rounded-2xl border p-4" style={{ backgroundColor: Colors.dark.card, borderColor: Colors.dark.border }}>
              <Text style={{ color: Colors.dark.textSecondary }}>Verification code</Text>
              <Text className="mt-2 text-base font-semibold" style={{ color: Colors.dark.textPrimary }}>
                {createdCode}
              </Text>
            </View>
          </FadeIn>
        ) : null}

        <View className="mt-6">
          <Text className="text-sm font-semibold" style={{ color: Colors.dark.textPrimary }}>
            Your workspaces
          </Text>
          {workspaces.length === 0 && !loading ? (
            <Text className="mt-2" style={{ color: Colors.dark.textSecondary }}>
              No workspaces yet.
            </Text>
          ) : (
            <View className="mt-3">
              {workspaces.map((w) => (
                <FadeIn key={w._id}>
                  <Pressable
                    onPress={() => {
                      void selectWorkspace(w._id);
                    }}
                    className="mb-2 rounded-xl border px-4 py-3"
                    style={({ pressed }) => ({
                      borderColor: w._id === activeId ? Colors.primaryBlue : Colors.dark.border,
                      backgroundColor: pressed ? "rgba(255,255,255,0.08)" : Colors.dark.card,
                    })}
                    accessibilityRole="button"
                    accessibilityLabel={`Select workspace ${w.name}`}
                  >
                    <Text className="text-base font-semibold" style={{ color: Colors.dark.textPrimary }}>
                      {w.name}
                    </Text>
                    <Text className="mt-1 text-xs" style={{ color: Colors.dark.textSecondary }}>
                      {(w.memberCount ?? w.members?.length ?? 0).toString()} members | {(w.publicChannelCount ?? 0).toString()} public | {(w.privateChannelCount ?? 0).toString()} private | {(w.messageCount ?? 0).toString()} msgs
                    </Text>
                    {w.verificationCode ? (
                      <Pressable
                        onPress={() => {
                          setJoinCode(w.verificationCode ?? "");
                        }}
                        className="mt-2 rounded-xl border px-3 py-2"
                        style={({ pressed }) => ({
                          backgroundColor: pressed ? "rgba(255,255,255,0.08)" : Colors.dark.surface2,
                          borderColor: Colors.dark.border,
                        })}
                        accessibilityRole="button"
                        accessibilityLabel={`Use verification code for workspace ${w.name}`}
                      >
                        <Text style={{ color: Colors.dark.textSecondary }} className="text-xs">
                          Verification code (tap to use)
                        </Text>
                        <Text selectable className="mt-1 text-base font-semibold" style={{ color: Colors.dark.textPrimary }}>
                          {w.verificationCode}
                        </Text>
                      </Pressable>
                    ) : null}
                    {w.description ? (
                      <Text className="mt-1 text-sm" style={{ color: Colors.dark.textSecondary }}>
                        {w.description}
                      </Text>
                    ) : null}
                  </Pressable>
                </FadeIn>
              ))}
            </View>
          )}
        </View>

        <FadeIn>
          <View className="mt-8 rounded-2xl border p-4" style={{ backgroundColor: Colors.dark.card, borderColor: Colors.dark.border }}>
          <Text className="text-sm font-semibold" style={{ color: Colors.dark.textPrimary }}>
            Create a workspace
          </Text>

          <View className="mt-3 rounded-xl border px-4" style={{ backgroundColor: Colors.dark.surface2, borderColor: Colors.dark.border }}>
            <TextInput
              value={createName}
              onChangeText={setCreateName}
              placeholder="Workspace name"
              placeholderTextColor={Colors.dark.textSecondary}
              className="h-11"
              style={{ color: Colors.dark.textPrimary }}
            />
          </View>
          <View className="mt-3 rounded-xl border px-4" style={{ backgroundColor: Colors.dark.surface2, borderColor: Colors.dark.border }}>
            <TextInput
              value={createDescription}
              onChangeText={setCreateDescription}
              placeholder="Description (optional)"
              className="h-11"
              placeholderTextColor={Colors.dark.textSecondary}
              style={{ color: Colors.dark.textPrimary }}
            />
          </View>

          <View className="mt-4">
            <PremiumButton
              title={busy ? "Creating..." : "Create"}
              onPress={() => {
                void onCreate();
              }}
              disabled={busy}
            />
          </View>
          </View>
        </FadeIn>

        <FadeIn>
          <View className="mt-4 rounded-2xl border p-4" style={{ backgroundColor: Colors.dark.card, borderColor: Colors.dark.border }}>
          <Text className="text-sm font-semibold" style={{ color: Colors.dark.textPrimary }}>
            Join a workspace
          </Text>

          <View className="mt-3 rounded-xl border px-4" style={{ backgroundColor: Colors.dark.surface2, borderColor: Colors.dark.border }}>
            <TextInput
              value={joinCode}
              onChangeText={setJoinCode}
              placeholder="Verification code"
              placeholderTextColor={Colors.dark.textSecondary}
              className="h-11"
              style={{ color: Colors.dark.textPrimary }}
            />
          </View>

          <View className="mt-4">
            <PremiumButton
              title={busy ? "Joining..." : "Join"}
              onPress={() => {
                void onJoin();
              }}
              disabled={busy}
              variant="secondary"
              style={{ borderWidth: 1, borderColor: Colors.primaryBlue, backgroundColor: "transparent" } as any}
            />
          </View>
          </View>
        </FadeIn>
      </ScrollView>
    </PremiumScreen>
  );
}

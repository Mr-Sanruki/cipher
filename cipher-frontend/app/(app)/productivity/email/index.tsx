import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../../../utils/colors";
import { PremiumScreen } from "../../../../components/PremiumScreen";
import { getActiveWorkspaceId } from "../../../../services/workspaceSelection";
import { listWorkspaceMembers, type WorkspaceMemberDto } from "../../../../services/workspaceMembers";
import { sendEmail } from "../../../../services/email";

export default function EmailScreen(): JSX.Element {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [members, setMembers] = useState<WorkspaceMemberDto[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [subject, setSubject] = useState<string>("");
  const [text, setText] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

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

  const reloadMembers = useCallback(async () => {
    if (!workspaceId) return;
    setBusy(true);
    setError(null);
    try {
      const m = await listWorkspaceMembers(workspaceId);
      setMembers(m);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to load members");
    } finally {
      setBusy(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void reloadMembers();
  }, [reloadMembers]);

  const selectable = useMemo(() => {
    return members
      .map((m) => m.user)
      .filter(Boolean)
      .map((u) => ({ _id: String((u as any)._id), name: String((u as any).name ?? ""), email: String((u as any).email ?? "") }))
      .filter((u) => !!u.email);
  }, [members]);

  const selectedEmails = useMemo(() => {
    return selectable.filter((u) => selected[u._id]).map((u) => u.email);
  }, [selectable, selected]);

  const canSend = useMemo(() => {
    return !!workspaceId && !busy && selectedEmails.length > 0 && !!subject.trim() && !!text.trim();
  }, [workspaceId, busy, selectedEmails.length, subject, text]);

  const toggle = useCallback((userId: string) => {
    setSelected((prev) => ({ ...prev, [userId]: !prev[userId] }));
  }, []);

  const onSend = useCallback(async () => {
    if (!workspaceId) {
      setError("No active workspace selected");
      return;
    }

    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await sendEmail({
        workspaceId,
        to: selectedEmails,
        subject: subject.trim(),
        text: text.trim(),
      });

      setStatus(res.message);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to send email");
    } finally {
      setBusy(false);
    }
  }, [workspaceId, selectedEmails, subject, text]);

  return (
    <PremiumScreen padded={false} topPadding={0}>
      <View style={{ paddingTop: 56, paddingHorizontal: 16, paddingBottom: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => ({ padding: 10, opacity: pressed ? 0.7 : 1 })}>
          <Ionicons name="chevron-back" size={22} color={Colors.dark.textPrimary} />
        </Pressable>
        <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900", fontSize: 18 }}>Email</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18 }}>
        <View style={{ borderRadius: 16, padding: 14, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900" }}>Recipients</Text>
            <Pressable
              disabled={busy}
              onPress={() => void reloadMembers()}
              style={({ pressed }) => ({ padding: 10, opacity: busy ? 0.5 : pressed ? 0.7 : 1 })}
            >
              <Ionicons name="refresh" size={18} color={Colors.dark.textPrimary} />
            </Pressable>
          </View>

          {!workspaceId ? <Text style={{ color: Colors.dark.textSecondary, marginTop: 8 }}>No active workspace selected</Text> : null}

          <View style={{ marginTop: 10, gap: 8 }}>
            {selectable.length === 0 ? (
              <Text style={{ color: Colors.dark.textSecondary }}>No members found</Text>
            ) : (
              selectable.map((u) => {
                const isOn = !!selected[u._id];
                return (
                  <Pressable
                    key={u._id}
                    onPress={() => toggle(u._id)}
                    style={({ pressed }) => ({
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderRadius: 14,
                      backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.18)",
                      borderWidth: 1,
                      borderColor: isOn ? "rgba(37,211,102,0.45)" : "rgba(255,255,255,0.08)",
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                    })}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900" }} numberOfLines={1}>
                        {u.name || u.email}
                      </Text>
                      <Text style={{ color: Colors.dark.textSecondary }} numberOfLines={1}>
                        {u.email}
                      </Text>
                    </View>
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.2)",
                        backgroundColor: isOn ? "rgba(37,211,102,1)" : "transparent",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ color: "#0b141a", fontWeight: "900" }}>{isOn ? "✓" : ""}</Text>
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>

          <Text style={{ color: Colors.dark.textSecondary, marginTop: 10 }}>Selected: {selectedEmails.length}</Text>
        </View>

        <View style={{ marginTop: 12, borderRadius: 16, padding: 14, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
          <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900" }}>Compose</Text>

          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="Subject"
            placeholderTextColor={Colors.dark.textSecondary}
            style={{
              marginTop: 10,
              borderRadius: 14,
              backgroundColor: "rgba(0,0,0,0.18)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
              paddingHorizontal: 12,
              paddingVertical: 10,
              color: Colors.dark.textPrimary,
            }}
          />

          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Write message"
            placeholderTextColor={Colors.dark.textSecondary}
            multiline
            textAlignVertical="top"
            style={{
              marginTop: 10,
              borderRadius: 14,
              backgroundColor: "rgba(0,0,0,0.18)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
              paddingHorizontal: 12,
              paddingVertical: 12,
              color: Colors.dark.textPrimary,
              minHeight: 160,
            }}
          />

          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <Pressable
              disabled={!canSend}
              onPress={() => void onSend()}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 12,
                borderRadius: 14,
                backgroundColor: !canSend ? "rgba(37,211,102,0.25)" : pressed ? "rgba(37,211,102,0.7)" : "rgba(37,211,102,1)",
                alignItems: "center",
              })}
            >
              <Text style={{ color: "white", fontWeight: "900" }}>{busy ? "Sending..." : "Send"}</Text>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={() => {
                setSubject("");
                setText("");
                setStatus(null);
                setError(null);
              }}
              style={({ pressed }) => ({
                paddingHorizontal: 14,
                borderRadius: 14,
                backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
                alignItems: "center",
                justifyContent: "center",
                opacity: busy ? 0.6 : 1,
              })}
            >
              <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900" }}>Clear</Text>
            </Pressable>
          </View>

          {status ? <Text style={{ color: Colors.dark.textSecondary, marginTop: 10 }}>{status}</Text> : null}
          {error ? <Text style={{ color: Colors.dark.textSecondary, marginTop: 10 }}>{error}</Text> : null}
        </View>
      </ScrollView>
    </PremiumScreen>
  );
}

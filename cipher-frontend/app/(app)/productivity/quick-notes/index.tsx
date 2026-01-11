import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../../../utils/colors";
import { PremiumScreen } from "../../../../components/PremiumScreen";
import { getActiveWorkspaceId } from "../../../../services/workspaceSelection";
import { createNote, deleteNote, listNotes, updateNote, type NoteDto } from "../../../../services/notes";

export default function QuickNotesScreen(): JSX.Element {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [q, setQ] = useState<string>("");
  const [notes, setNotes] = useState<NoteDto[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState<string>("");
  const [content, setContent] = useState<string>("");

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
      const next = await listNotes({ workspaceId, q: q.trim() || undefined });
      setNotes(next);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to load notes");
    } finally {
      setBusy(false);
    }
  }, [workspaceId, q]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const canSave = useMemo(() => {
    return !!workspaceId && !busy && (!!title.trim() || !!content.trim());
  }, [workspaceId, busy, title, content]);

  const startNew = useCallback(() => {
    setEditingId(null);
    setTitle("");
    setContent("");
    setStatus(null);
    setError(null);
  }, []);

  const startEdit = useCallback((n: NoteDto) => {
    setEditingId(n._id);
    setTitle(String(n.title ?? ""));
    setContent(String(n.content ?? ""));
    setStatus(null);
    setError(null);
  }, []);

  const onSave = useCallback(async () => {
    if (!workspaceId) {
      setError("No active workspace selected");
      return;
    }
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      if (editingId) {
        const updated = await updateNote(editingId, { title: title.trim(), content: content });
        setNotes((prev) => prev.map((x) => (x._id === updated._id ? updated : x)));
        setStatus("Saved");
      } else {
        const created = await createNote({ workspaceId, title: title.trim(), content });
        setNotes((prev) => [created, ...prev]);
        setStatus("Created");
      }
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to save note");
    } finally {
      setBusy(false);
    }
  }, [workspaceId, editingId, title, content]);

  const onRemove = useCallback(async (n: NoteDto) => {
    setNotes((prev) => prev.filter((x) => x._id !== n._id));
    try {
      await deleteNote(n._id);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to delete note");
      setNotes((prev) => [n, ...prev]);
    }
  }, []);

  return (
    <PremiumScreen padded={false} topPadding={0}>
      <View style={{ paddingTop: 56, paddingHorizontal: 16, paddingBottom: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => ({ padding: 10, opacity: pressed ? 0.7 : 1 })}>
          <Ionicons name="chevron-back" size={22} color={Colors.dark.textPrimary} />
        </Pressable>
        <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900", fontSize: 18 }}>Quick Notes</Text>
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
        <View style={{ borderRadius: 16, padding: 12, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search notes"
            placeholderTextColor={Colors.dark.textSecondary}
            style={{ color: Colors.dark.textPrimary, paddingHorizontal: 8, paddingVertical: 10 }}
          />
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <Pressable
              disabled={busy}
              onPress={() => void reload()}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 12,
                borderRadius: 14,
                backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
                alignItems: "center",
                opacity: busy ? 0.6 : 1,
              })}
            >
              <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900" }}>{busy ? "Loading..." : "Search"}</Text>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={startNew}
              style={({ pressed }) => ({
                paddingHorizontal: 14,
                borderRadius: 14,
                backgroundColor: pressed ? "rgba(37,211,102,0.7)" : "rgba(37,211,102,1)",
                alignItems: "center",
                justifyContent: "center",
                opacity: busy ? 0.6 : 1,
              })}
            >
              <Ionicons name="add" size={18} color="white" />
            </Pressable>
          </View>
        </View>

        {error ? <Text style={{ color: Colors.dark.textSecondary, marginTop: 10 }}>{error}</Text> : null}
        {status ? <Text style={{ color: Colors.dark.textSecondary, marginTop: 10 }}>{status}</Text> : null}
        {!workspaceId ? <Text style={{ color: Colors.dark.textSecondary, marginTop: 10 }}>No active workspace selected</Text> : null}
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
        <View style={{ borderRadius: 16, padding: 12, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
          <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900" }}>{editingId ? "Edit note" : "New note"}</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Title"
            placeholderTextColor={Colors.dark.textSecondary}
            style={{ marginTop: 10, color: Colors.dark.textPrimary, paddingHorizontal: 8, paddingVertical: 10, backgroundColor: "rgba(0,0,0,0.18)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}
          />
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder="Write note"
            placeholderTextColor={Colors.dark.textSecondary}
            multiline
            textAlignVertical="top"
            style={{ marginTop: 10, color: Colors.dark.textPrimary, paddingHorizontal: 10, paddingVertical: 12, minHeight: 120, backgroundColor: "rgba(0,0,0,0.18)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}
          />
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <Pressable
              disabled={!canSave}
              onPress={() => void onSave()}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 12,
                borderRadius: 14,
                backgroundColor: !canSave ? "rgba(37,211,102,0.25)" : pressed ? "rgba(37,211,102,0.7)" : "rgba(37,211,102,1)",
                alignItems: "center",
              })}
            >
              <Text style={{ color: "white", fontWeight: "900" }}>{busy ? "Please wait..." : "Save"}</Text>
            </Pressable>
            {editingId ? (
              <Pressable
                disabled={busy}
                onPress={startNew}
                style={({ pressed }) => ({
                  paddingHorizontal: 14,
                  borderRadius: 14,
                  backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
                  alignItems: "center",
                  justifyContent: "center",
                })}
              >
                <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900" }}>Cancel</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      <FlatList
        style={{ flex: 1, marginTop: 10 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 18 }}
        data={notes}
        keyExtractor={(it) => it._id}
        renderItem={({ item }) => {
          const snippet = String(item.content ?? "").trim().slice(0, 120);
          return (
            <Pressable
              onPress={() => startEdit(item)}
              style={({ pressed }) => ({
                paddingVertical: 12,
                paddingHorizontal: 12,
                borderRadius: 16,
                backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
                marginBottom: 10,
              })}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900" }} numberOfLines={1}>
                    {String(item.title ?? "").trim() || "Untitled"}
                  </Text>
                  <Text style={{ color: Colors.dark.textSecondary, marginTop: 6 }} numberOfLines={2}>
                    {snippet || "(empty)"}
                  </Text>
                </View>
                <Pressable onPress={() => void onRemove(item)} style={({ pressed }) => ({ padding: 8, opacity: pressed ? 0.7 : 1 })}>
                  <Ionicons name="trash" size={18} color={Colors.dark.textSecondary} />
                </Pressable>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={!busy ? <Text style={{ color: Colors.dark.textSecondary, paddingTop: 30, textAlign: "center" }}>No notes yet</Text> : null}
      />
    </PremiumScreen>
  );
}

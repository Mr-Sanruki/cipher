import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../../../utils/colors";
import { PremiumScreen } from "../../../../components/PremiumScreen";
import { getActiveWorkspaceId } from "../../../../services/workspaceSelection";
import { runCompiler, type CompilerRunResponse } from "../../../../services/compiler";

export default function CompilerScreen(): JSX.Element {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [code, setCode] = useState<string>("console.log('Cipher');\nreturn 'ok';");
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompilerRunResponse | null>(null);

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

  const canRun = useMemo(() => !!workspaceId && !busy && !!code.trim(), [workspaceId, busy, code]);

  const onRun = useCallback(async () => {
    if (!workspaceId) {
      setError("No active workspace selected");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await runCompiler({ workspaceId, code, timeoutMs: 1500, language: "javascript" });
      setResult(res);
    } catch (e: any) {
      setResult(null);
      setError(typeof e?.message === "string" ? e.message : "Failed to run");
    } finally {
      setBusy(false);
    }
  }, [workspaceId, code]);

  return (
    <PremiumScreen padded={false} topPadding={0}>
      <View style={{ paddingTop: 56, paddingHorizontal: 16, paddingBottom: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => ({ padding: 10, opacity: pressed ? 0.7 : 1 })}>
          <Ionicons name="chevron-back" size={22} color={Colors.dark.textPrimary} />
        </Pressable>
        <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900", fontSize: 18 }}>Compiler</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18 }}>
        <View style={{ borderRadius: 16, padding: 14, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
          <Text style={{ color: Colors.dark.textSecondary }}>JavaScript runner (safe VM). Try: console.log('Cipher')</Text>

          <View style={{ marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(0,0,0,0.22)" }}>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="Write code here"
              placeholderTextColor={Colors.dark.textSecondary}
              multiline
              textAlignVertical="top"
              style={{ color: Colors.dark.textPrimary, paddingHorizontal: 12, paddingVertical: 12, minHeight: 180 }}
            />
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <Pressable
              disabled={!canRun}
              onPress={() => void onRun()}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 12,
                borderRadius: 14,
                backgroundColor: !canRun ? "rgba(37,211,102,0.25)" : pressed ? "rgba(37,211,102,0.7)" : "rgba(37,211,102,1)",
                alignItems: "center",
              })}
            >
              <Text style={{ color: "white", fontWeight: "900" }}>{busy ? "Running..." : "Run"}</Text>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={() => {
                setResult(null);
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

          {!workspaceId ? <Text style={{ color: Colors.dark.textSecondary, marginTop: 10 }}>No active workspace selected</Text> : null}
          {error ? <Text style={{ color: Colors.dark.textSecondary, marginTop: 10 }}>{error}</Text> : null}
        </View>

        {result ? (
          <View style={{ marginTop: 12, borderRadius: 16, padding: 14, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
            <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900" }}>Output</Text>
            <Text style={{ color: Colors.dark.textSecondary, marginTop: 6 }}>duration: {result.durationMs}ms</Text>

            {result.error ? <Text style={{ color: Colors.dark.textSecondary, marginTop: 10 }}>error: {result.error}</Text> : null}
            {result.result !== null ? <Text style={{ color: Colors.dark.textSecondary, marginTop: 10 }}>result: {result.result}</Text> : null}

            <Text style={{ color: Colors.dark.textSecondary, marginTop: 10 }}>stdout{result.stdoutTruncated ? " (truncated)" : ""}:</Text>
            <View style={{ marginTop: 8, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.22)", padding: 12 }}>
              <Text style={{ color: Colors.dark.textPrimary }}>{result.stdout || "(empty)"}</Text>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </PremiumScreen>
  );
}

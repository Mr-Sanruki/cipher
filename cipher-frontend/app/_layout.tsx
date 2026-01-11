import React, { useEffect, useState } from "react";
import { NativeWindStyleSheet } from "nativewind";
import { Stack, router, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";
import { AuthProvider } from "../context/AuthContext";
import { useAuth } from "../hooks/useAuth";

NativeWindStyleSheet.setOutput({ web: "native", default: "native" });

let lastFatalError: { message: string; stack?: string } | null = null;
let reportFatalError: ((err: { message: string; stack?: string } | null) => void) | null = null;

try {
  const errorUtils = (global as any)?.ErrorUtils;
  const prevHandler = errorUtils?.getGlobalHandler?.();

  if (errorUtils?.setGlobalHandler) {
    errorUtils.setGlobalHandler((err: any, isFatal?: boolean) => {
      const payload = {
        message: typeof err?.message === "string" ? err.message : String(err),
        stack: typeof err?.stack === "string" ? err.stack : undefined,
      };

      if (isFatal) {
        lastFatalError = payload;
        reportFatalError?.(payload);
      }

      // eslint-disable-next-line no-console
      console.error("UNCAUGHT_JS_ERROR", { isFatal, ...payload });

      if (__DEV__) {
        prevHandler?.(err, isFatal);
      }
    });
  }
} catch {
  // ignore
}

export default function RootLayout(): JSX.Element {
  const [fatal, setFatal] = useState(lastFatalError);

  useEffect(() => {
    reportFatalError = setFatal;
    return () => {
      reportFatalError = null;
    };
  }, []);

  if (fatal) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0b141a", paddingTop: 60, paddingHorizontal: 16 }}>
        <StatusBar style="light" />
        <Text style={{ color: "white", fontWeight: "900", fontSize: 18, marginBottom: 10 }}>App error</Text>
        <Text style={{ color: "rgba(255,255,255,0.85)", marginBottom: 10 }}>{fatal.message}</Text>
        {fatal.stack ? <Text style={{ color: "rgba(255,255,255,0.6)", fontFamily: "monospace" }}>{fatal.stack}</Text> : null}
      </View>
    );
  }

  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}

function RootLayoutNav(): JSX.Element {
  const { status, token } = useAuth();
  const segments = useSegments();

  useEffect(() => {
    if (status === "loading") return;

    const inAuthGroup = segments[0] === "(auth)";

    if (status === "unauthenticated" && !inAuthGroup) {
      router.replace("/(auth)/login");
      return;
    }

    if (status === "authenticated" && inAuthGroup) {
      router.replace("/(app)/chat");
    }
  }, [segments, status, token]);

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false, animation: "fade" }} />
    </>
  );
}

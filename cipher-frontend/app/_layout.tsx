import React, { useEffect } from "react";
import { NativeWindStyleSheet } from "nativewind";
import { Stack, router, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "../context/AuthContext";
import { useAuth } from "../hooks/useAuth";

NativeWindStyleSheet.setOutput({ web: "native", default: "native" });

if (__DEV__) {
  try {
    const errorUtils = (global as any)?.ErrorUtils;
    const prevHandler = errorUtils?.getGlobalHandler?.();

    if (errorUtils?.setGlobalHandler) {
      errorUtils.setGlobalHandler((err: any, isFatal?: boolean) => {
        // eslint-disable-next-line no-console
        console.error("UNCAUGHT_JS_ERROR", { isFatal, message: err?.message, stack: err?.stack });
        prevHandler?.(err, isFatal);
      });
    }
  } catch {
    // ignore
  }
}

export default function RootLayout(): JSX.Element {
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

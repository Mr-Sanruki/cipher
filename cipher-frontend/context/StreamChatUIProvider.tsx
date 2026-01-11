import React, { useMemo } from "react";
import { Platform } from "react-native";
import { useStreamChat } from "../hooks/useStreamChat";
import { Colors } from "../utils/colors";

export function StreamChatUIProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const { client } = useStreamChat();

  const theme = useMemo<any>(
    () =>
      ({
        colors: {
          accent_blue: Colors.primaryBlue,
          bg_gradient_start: Colors.dark.background,
          bg_gradient_end: Colors.dark.surface,
          black: "#000000",
          white: "#FFFFFF",
          white_snow: Colors.dark.textPrimary,
          grey: "#9CA3AF",
          grey_gainsboro: "#374151",
          grey_whisper: "#1F2937",
          grey_dark: "#111827",
          grey_darkest: Colors.dark.background,
          overlay: "rgba(0,0,0,0.55)",
          transparent: "transparent",
        },
      } as any),
    [],
  );

  if (Platform.OS === "web") {
    return <>{children}</>;
  }

  if (!client) {
    return <>{children}</>;
  }

  let OverlayProvider: any;
  let Chat: any;
  try {
    const mod = require("stream-chat-react-native") as any;
    OverlayProvider = mod?.OverlayProvider;
    Chat = mod?.Chat;
  } catch {
    return <>{children}</>;
  }

  if (!OverlayProvider || !Chat) {
    return <>{children}</>;
  }

  return (
    <OverlayProvider value={{ style: theme } as any}>
      <Chat client={client}>{children}</Chat>
    </OverlayProvider>
  );
}

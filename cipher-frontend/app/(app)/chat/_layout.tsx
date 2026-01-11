import React from "react";
import { Stack } from "expo-router";
import { StreamChatWebProvider } from "../../../context/StreamChatWebProvider";

export default function ChatLayout(): JSX.Element {
  return (
    <StreamChatWebProvider>
      <Stack screenOptions={{ headerShown: false, animation: "fade" }} />
    </StreamChatWebProvider>
  );
}

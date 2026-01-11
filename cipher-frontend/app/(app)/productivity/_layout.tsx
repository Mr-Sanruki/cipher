import React from "react";
import { Stack } from "expo-router";

export default function ProductivityLayout(): JSX.Element {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}

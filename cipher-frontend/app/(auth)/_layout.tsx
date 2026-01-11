import React from "react";
import { Stack } from "expo-router";

export default function AuthLayout(): JSX.Element {
  return <Stack screenOptions={{ headerShown: false }} />;
}

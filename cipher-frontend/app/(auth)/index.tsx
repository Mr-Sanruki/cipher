import React from "react";
import { Redirect } from "expo-router";

export default function AuthIndex(): JSX.Element {
  return <Redirect href="/(auth)/login" />;
}

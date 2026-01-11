import React from "react";
import { ActivityIndicator, View } from "react-native";
import { Colors } from "../utils/colors";

export function LoadingSpinner({ size = "small" }: { size?: "small" | "large" }): JSX.Element {
  return (
    <View className="items-center justify-center">
      <ActivityIndicator size={size} color={Colors.primaryBlue} />
    </View>
  );
}

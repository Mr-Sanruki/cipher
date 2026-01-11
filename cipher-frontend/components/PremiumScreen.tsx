import React from "react";
import { Platform, StatusBar, View, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Colors } from "../utils/colors";

export function PremiumScreen({
  children,
  padded = true,
  style,
  topPadding,
}: {
  children: React.ReactNode;
  padded?: boolean;
  style?: ViewStyle;
  topPadding?: number;
}): JSX.Element {
  return (
    <LinearGradient colors={[Colors.dark.background, Colors.dark.surface]} className="flex-1">
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(255,255,255,0.07)", "rgba(255,255,255,0)"]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}
      />
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(16,185,129,0.08)", "rgba(88,101,242,0.00)"]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}
      />
      <View
        className={padded ? "flex-1 px-4" : "flex-1"}
        style={{
          paddingTop: topPadding ?? (Platform.OS === "android" ? 48 : 56),
          paddingBottom: 0,
          ...(style ?? {}),
        }}
      >
        <StatusBar barStyle="light-content" />
        {children}
      </View>
    </LinearGradient>
  );
}

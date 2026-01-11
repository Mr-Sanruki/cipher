import React, { useEffect, useRef } from "react";
import { Animated, View, type ViewStyle } from "react-native";
import { Colors } from "../utils/colors";

export function Skeleton({
  height,
  width = "100%",
  radius = 14,
  style,
}: {
  height: number;
  width?: number | "auto" | `${number}%`;
  radius?: number;
  style?: ViewStyle;
}): JSX.Element {
  const opacity = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.55, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: Colors.dark.muted },
        style,
        { opacity },
      ]}
    />
  );
}

export function SkeletonMessageList({ count = 8 }: { count?: number }): JSX.Element {
  return (
    <View className="pt-2">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} className="mb-4">
          <Skeleton height={14} width={120} radius={10} />
          <View className="mt-2">
            <Skeleton height={44} radius={18} />
          </View>
        </View>
      ))}
    </View>
  );
}

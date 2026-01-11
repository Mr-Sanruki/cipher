import React, { useEffect, useRef } from "react";
import { Animated, type ViewStyle } from "react-native";

export function Pop({
  children,
  style,
  scaleFrom = 0.85,
  durationMs = 140,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  scaleFrom?: number;
  durationMs?: number;
}): JSX.Element {
  const scale = useRef(new Animated.Value(scaleFrom)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 8 }),
      Animated.timing(opacity, { toValue: 1, duration: durationMs, useNativeDriver: true }),
    ]).start();
  }, [durationMs, opacity, scale]);

  return (
    <Animated.View style={[style, { opacity, transform: [{ scale }] }]}>
      {children}
    </Animated.View>
  );
}

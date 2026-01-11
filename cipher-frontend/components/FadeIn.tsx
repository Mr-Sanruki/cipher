import React, { useEffect, useRef } from "react";
import { Animated, type ViewStyle } from "react-native";

export function FadeIn({
  children,
  durationMs = 160,
  fromY = 6,
  style,
}: {
  children: React.ReactNode;
  durationMs?: number;
  fromY?: number;
  style?: ViewStyle;
}): JSX.Element {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(fromY)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: durationMs, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: durationMs, useNativeDriver: true }),
    ]).start();
  }, [durationMs, opacity, translateY]);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

import React, { useEffect, useMemo, useRef } from "react";
import { Animated, View } from "react-native";
import { Colors } from "../utils/colors";

function Dot({ delayMs, color }: { delayMs: number; color: string }): JSX.Element {
  const v = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delayMs),
        Animated.timing(v, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.35, duration: 260, useNativeDriver: true }),
        Animated.delay(200),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delayMs, v]);

  return (
    <Animated.View
      style={{
        height: 6,
        width: 6,
        borderRadius: 3,
        backgroundColor: color,
        marginHorizontal: 3,
        opacity: v,
        transform: [{ translateY: v.interpolate({ inputRange: [0.35, 1], outputRange: [0, -3] }) }],
      }}
    />
  );
}

export function TypingDots({
  color,
}: {
  color?: string;
}): JSX.Element {
  const dotColor = useMemo(() => color ?? Colors.dark.textSecondary, [color]);

  return (
    <View className="flex-row items-center">
      <Dot delayMs={0} color={dotColor} />
      <Dot delayMs={120} color={dotColor} />
      <Dot delayMs={240} color={dotColor} />
    </View>
  );
}

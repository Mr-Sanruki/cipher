import React, { useMemo, useRef } from "react";
import { Animated, Pressable, Text, type ViewStyle } from "react-native";
import { Colors } from "../utils/colors";

export function PremiumButton({
  title,
  onPress,
  disabled,
  variant = "primary",
  style,
  right,
  left,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  style?: ViewStyle;
  left?: React.ReactNode;
  right?: React.ReactNode;
}): JSX.Element {
  const scale = useRef(new Animated.Value(1)).current;

  const bg = useMemo(() => {
    if (variant === "danger") return Colors.errorRed;
    if (variant === "secondary") return Colors.dark.muted;
    return Colors.primaryBlue;
  }, [variant]);

  const textColor = useMemo(() => {
    if (variant === "secondary") return Colors.dark.textPrimary;
    return "#FFFFFF";
  }, [variant]);

  function pressIn() {
    Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, speed: 30, bounciness: 0 }).start();
  }

  function pressOut() {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 24, bounciness: 6 }).start();
  }

  return (
    <Animated.View style={{ transform: [{ scale }], opacity: disabled ? 0.6 : 1, ...(style ?? {}) }}>
      <Pressable
        onPress={() => {
          if (!disabled) onPress();
        }}
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={disabled}
        className="h-12 flex-row items-center justify-center rounded-2xl px-4"
        style={{ backgroundColor: bg }}
        accessibilityRole="button"
        accessibilityLabel={title}
      >
        {left ? <Text className="mr-2">{left as any}</Text> : null}
        <Text className="text-base font-semibold" style={{ color: textColor }}>
          {title}
        </Text>
        {right ? <Text className="ml-2">{right as any}</Text> : null}
      </Pressable>
    </Animated.View>
  );
}

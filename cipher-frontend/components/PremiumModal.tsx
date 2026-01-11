import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { Colors } from "../utils/colors";

export function PremiumModal({
  visible,
  title,
  onClose,
  children,
  fullScreen,
  style,
  canClose = true,
  presentation = "center",
}: {
  visible: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  fullScreen?: boolean;
  style?: ViewStyle;
  canClose?: boolean;
  presentation?: "center" | "bottom";
}): JSX.Element {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    if (!visible) return;
    opacity.setValue(0);
    translateY.setValue(18);

    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 6 }),
    ]).start();
  }, [opacity, translateY, visible]);

  const canSwipeClose = useMemo(() => Platform.OS !== "web" && canClose && !fullScreen, [canClose, fullScreen]);

  const isBottom = presentation === "bottom" && !fullScreen;

  const pan = useRef(new Animated.Value(0)).current;
  const panResponder = useMemo(() => {
    if (!canSwipeClose) return null;

    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) pan.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 120) {
          onClose();
          pan.setValue(0);
          return;
        }

        Animated.spring(pan, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
      },
    });
  }, [canSwipeClose, onClose, pan]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={() => {
        if (canClose) onClose();
      }}
    >
      <Animated.View style={{ flex: 1, opacity, backgroundColor: "rgba(0,0,0,0.55)" }}>
        <Pressable
          onPress={() => {
            if (canClose) onClose();
          }}
          style={{ flex: 1, justifyContent: fullScreen ? "flex-start" : isBottom ? "flex-end" : "center", padding: 16 }}
        >
          <Animated.View
            {...(panResponder ? (panResponder.panHandlers as any) : {})}
            style={{
              transform: [{ translateY }, { translateY: pan }],
              backgroundColor: "rgba(14,16,24,0.96)",
              borderColor: "rgba(255,255,255,0.10)",
              borderWidth: 1,
              borderRadius: fullScreen ? 0 : isBottom ? 18 : 22,
              borderTopLeftRadius: fullScreen ? 0 : isBottom ? 18 : 22,
              borderTopRightRadius: fullScreen ? 0 : isBottom ? 18 : 22,
              borderBottomLeftRadius: fullScreen ? 0 : isBottom ? 18 : 22,
              borderBottomRightRadius: fullScreen ? 0 : isBottom ? 18 : 22,
              overflow: "hidden",
              width: "100%",
              maxWidth: 520,
              alignSelf: "center",
              ...(fullScreen ? { flex: 1, marginTop: Platform.OS === "android" ? 0 : 0 } : {}),
              ...(isBottom ? { alignSelf: "stretch", maxWidth: undefined as any } : {}),
              ...(style ?? {}),
            }}
          >
            <Pressable onPress={() => {}} style={{ padding: 16 }}>
              {canSwipeClose ? (
                <View style={{ alignItems: "center", paddingBottom: 10 }}>
                  <View style={{ width: 44, height: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.18)" }} />
                </View>
              ) : null}

              <View className="flex-row items-center justify-between">
                {title ? (
                  <Text className="text-base font-semibold" style={{ color: Colors.dark.textPrimary }}>
                    {title}
                  </Text>
                ) : (
                  <View />
                )}

                {canClose ? (
                  <Pressable
                    onPress={onClose}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="Close modal"
                    style={({ pressed }) => ({ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)" })}
                  >
                    <Text style={{ color: "rgba(255,255,255,0.78)", fontWeight: "800" }}>Close</Text>
                  </Pressable>
                ) : null}
              </View>

              <View className="mt-3">{children}</View>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

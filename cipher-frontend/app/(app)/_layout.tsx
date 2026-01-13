import React, { useMemo, useRef } from "react";
import { Tabs, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Animated, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../../utils/colors";
import { SocketProvider } from "../../context/SocketContext";
import { StreamChatProvider } from "../../context/StreamChatContext";
import { CallProvider } from "../../context/CallContext";

function PremiumTabIcon({ name, focused, color, size }: { name: any; focused: boolean; color: string; size?: number }): JSX.Element {
  return (
    <View style={{ width: 42, height: 30, alignItems: "center", justifyContent: "center" }}>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          width: 36,
          height: 28,
          borderRadius: 14,
          backgroundColor: focused ? "rgba(120,140,255,0.18)" : "rgba(255,255,255,0.04)",
          borderWidth: 1,
          borderColor: focused ? "rgba(120,140,255,0.28)" : "rgba(255,255,255,0.08)",
        }}
      />
      <Ionicons name={name} size={size ?? 22} color={focused ? "white" : color} />
    </View>
  );
}

function AnimatedTabBarButton(props: any): JSX.Element {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = useMemo(
    () => () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 22, bounciness: 0 }).start(),
    [scale],
  );
  const pressOut = useMemo(
    () => () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 6 }).start(),
    [scale],
  );

  return (
    <Animated.View style={[props?.style, { transform: [{ scale }] }]}>
      <Pressable
        {...props}
        onPressIn={(e) => {
          pressIn();
          props?.onPressIn?.(e);
        }}
        onPressOut={(e) => {
          pressOut();
          props?.onPressOut?.(e);
        }}
      />
    </Animated.View>
  );
}

export default function AppLayout(): JSX.Element {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const hideTabBar = useMemo(() => {
    const p = String(pathname ?? "");
    if (p.includes("/call/")) return true;
    if (p.includes("/chat/dm/")) return true;
    // channel detail is /chat/[channelId] (but not /chat itself)
    if (p.startsWith("/chat/") && !p.startsWith("/chat/dm/") && p !== "/chat") return true;
    return false;
  }, [pathname]);

  return (
    <SocketProvider>
      <CallProvider>
        <StreamChatProvider>
          <Tabs
            screenOptions={{
              headerShown: false,
              tabBarActiveTintColor: "white",
              tabBarInactiveTintColor: "rgba(255,255,255,0.65)",
              tabBarHideOnKeyboard: true,
              tabBarStyle: hideTabBar
                ? { display: "none" }
                : {
                    backgroundColor: "rgba(14,16,24,0.92)",
                    borderTopColor: "rgba(255,255,255,0.08)",
                    borderTopWidth: 1,
                    height: 56 + Math.max(insets.bottom, 8),
                    paddingTop: 6,
                    paddingBottom: Math.max(insets.bottom, 8),
                  },
              tabBarLabelStyle: { fontSize: 11, marginTop: 2 },
              tabBarIconStyle: { marginTop: 2 },
              tabBarButton: (props) => <AnimatedTabBarButton {...props} />,
            }}
          >
            <Tabs.Screen
              name="chat"
              options={{
                title: "Chat",
                tabBarIcon: ({ focused, color, size }) => <PremiumTabIcon name="chatbubbles" focused={focused} color={color} size={size} />,
              }}
            />
            <Tabs.Screen
              name="productivity"
              options={{
                title: "Productivity",
                tabBarIcon: ({ focused, color, size }) => <PremiumTabIcon name="apps" focused={focused} color={color} size={size} />,
              }}
            />
            <Tabs.Screen
              name="workspace"
              options={{
                title: "Workspace",
                tabBarIcon: ({ focused, color, size }) => <PremiumTabIcon name="briefcase" focused={focused} color={color} size={size} />,
              }}
            />
            <Tabs.Screen
              name="ai"
              options={{
                title: "AI",
                tabBarIcon: ({ focused, color, size }) => <PremiumTabIcon name="sparkles" focused={focused} color={color} size={size} />,
              }}
            />
            <Tabs.Screen
              name="settings"
              options={{
                title: "Settings",
                tabBarIcon: ({ focused, color, size }) => <PremiumTabIcon name="settings" focused={focused} color={color} size={size} />,
              }}
            />

            <Tabs.Screen
              name="call/[callId]"
              options={{
                href: null,
              }}
            />
          </Tabs>
        </StreamChatProvider>
      </CallProvider>
    </SocketProvider>
  );
}

import React, { useMemo } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../../utils/colors";
import { PremiumScreen } from "../../../components/PremiumScreen";
import { FadeIn } from "../../../components/FadeIn";

type Card = {
  key: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: string;
};

export default function ProductivityHome(): JSX.Element {
  const cards = useMemo<Card[]>(
    () => [
      {
        key: "tasks",
        title: "Tasks",
        subtitle: "To-do list, priorities, reorder",
        icon: "checkbox",
        href: "/(app)/productivity/tasks",
      },
      {
        key: "email",
        title: "Email",
        subtitle: "Pick members, compose, send",
        icon: "mail",
        href: "/(app)/productivity/email",
      },
      {
        key: "calendar",
        title: "Calendar",
        subtitle: "Plan your day + drag & drop",
        icon: "calendar",
        href: "/(app)/productivity/calendar",
      },
      {
        key: "dashboard",
        title: "Dashboard",
        subtitle: "Today’s stats + quick actions",
        icon: "speedometer",
        href: "/(app)/productivity/dashboard",
      },
      {
        key: "focus-timer",
        title: "Focus Timer",
        subtitle: "Pomodoro 25/5 + charts",
        icon: "timer",
        href: "/(app)/productivity/focus-timer",
      },
      {
        key: "quick-notes",
        title: "Quick Notes",
        subtitle: "Notes + search + tags",
        icon: "document-text",
        href: "/(app)/productivity/quick-notes",
      },
    ],
    []
  );

  return (
    <PremiumScreen padded={false} topPadding={0}>
      <View style={{ paddingTop: 56, paddingHorizontal: 16, paddingBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900", fontSize: 18 }}>Productivity</Text>
        <Pressable
          onPress={() => router.push("/(app)/chat")}
          style={({ pressed }) => ({ padding: 10, opacity: pressed ? 0.7 : 1 })}
        >
          <Ionicons name="chatbubbles" size={20} color={Colors.dark.textPrimary} />
        </Pressable>
      </View>

      <Text style={{ color: Colors.dark.textSecondary, paddingHorizontal: 16, marginTop: 4 }}>
        Tap a tool to open
      </Text>

      <FlatList
        data={cards}
        keyExtractor={(c) => c.key}
        numColumns={2}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 18 }}
        columnWrapperStyle={{ gap: 12, marginBottom: 12 }}
        renderItem={({ item: c }) => (
          <FadeIn>
            <Pressable
              onPress={() => router.push(c.href as any)}
              style={({ pressed }) => ({
                flex: 1,
                borderRadius: 18,
                padding: 14,
                minHeight: 150,
                backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.06)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
              })}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 14,
                    backgroundColor: "rgba(37,211,102,0.18)",
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: "rgba(37,211,102,0.35)",
                  }}
                >
                  <Ionicons name={c.icon} size={20} color={Colors.dark.textPrimary} />
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.dark.textSecondary} />
              </View>

              <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900", fontSize: 16, marginTop: 12 }}>
                {c.title}
              </Text>
              <Text style={{ color: Colors.dark.textSecondary, marginTop: 6 }} numberOfLines={2}>
                {c.subtitle}
              </Text>
            </Pressable>
          </FadeIn>
        )}
      />
    </PremiumScreen>
  );
}

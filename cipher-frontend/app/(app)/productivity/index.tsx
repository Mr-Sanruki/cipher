import React, { useMemo, useState } from "react";
import { FlatList, Pressable, Text, View, useWindowDimensions, ScrollView, Animated } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../../utils/colors";
import { PremiumScreen } from "../../../components/PremiumScreen";
import { FadeIn } from "../../../components/FadeIn";
import { SmartSuggestions } from "../../../components/AiAutomation";

type Card = {
  key: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: string;
  color: string;
  aiFeature?: boolean;
};

export default function ProductivityHome(): JSX.Element {
  const { width: screenW } = useWindowDimensions();
  const gutter = 12;
  const horizontalPadding = 16;
  const cardW = useMemo(() => {
    const w = Math.floor((screenW - horizontalPadding * 2 - gutter) / 2);
    return Math.max(140, w);
  }, [screenW]);

  const cards = useMemo<Card[]>(
    () => [
      {
        key: "tasks",
        title: "Tasks",
        subtitle: "AI-powered task management",
        icon: "checkbox",
        href: "/(app)/productivity/tasks",
        color: "#25D366",
        aiFeature: true,
      },
      {
        key: "habits",
        title: "Habits",
        subtitle: "Build habits with AI insights",
        icon: "repeat",
        href: "/(app)/productivity/habit-tracker",
        color: "#34B7F1",
        aiFeature: true,
      },
      {
        key: "calendar",
        title: "Calendar",
        subtitle: "Smart scheduling with AI",
        icon: "calendar",
        href: "/(app)/productivity/calendar",
        color: "#FFD700",
        aiFeature: true,
      },
      {
        key: "focus-timer",
        title: "Focus Timer",
        subtitle: "Pomodoro + AI productivity",
        icon: "timer",
        href: "/(app)/productivity/focus-timer",
        color: "#FF6B6B",
        aiFeature: false,
      },
      {
        key: "dashboard",
        title: "Dashboard",
        subtitle: "Analytics & insights",
        icon: "speedometer",
        href: "/(app)/productivity/dashboard",
        color: "#9B59B6",
        aiFeature: false,
      },
      {
        key: "quick-notes",
        title: "Quick Notes",
        subtitle: "Notes with AI summarization",
        icon: "document-text",
        href: "/(app)/productivity/quick-notes",
        color: "#E67E22",
        aiFeature: true,
      },
      {
        key: "email",
        title: "Email",
        subtitle: "Smart email composer",
        icon: "mail",
        href: "/(app)/productivity/email",
        color: "#1ABC9C",
        aiFeature: true,
      },
      {
        key: "compiler",
        title: "Code Runner",
        subtitle: "Execute code snippets",
        icon: "code-slash",
        href: "/(app)/productivity/compiler",
        color: "#34495E",
        aiFeature: false,
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

                width: cardW,

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


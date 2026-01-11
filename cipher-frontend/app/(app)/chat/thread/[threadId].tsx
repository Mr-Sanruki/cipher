import React from "react";
import { Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Colors } from "../../../../utils/colors";

export default function ThreadScreen(): JSX.Element {
  const params = useLocalSearchParams<{ threadId?: string }>();
  const threadId = (params.threadId ?? "").toString();

  return (
    <View className="flex-1 bg-white px-4 pt-14">
      <View className="flex-row items-center justify-between">
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={{ color: Colors.primaryBlue }}>Back</Text>
        </Pressable>
        <Text className="text-base font-semibold" style={{ color: Colors.light.textPrimary }}>
          Thread {threadId}
        </Text>
        <View className="w-10" />
      </View>

      <View className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <Text className="text-sm" style={{ color: Colors.light.textSecondary }}>
          Thread view UI will be connected to real message threads in the chat phase.
        </Text>
      </View>
    </View>
  );
}

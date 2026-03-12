import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import api from "./api";
import { getItem, setItem } from "./storage";

const TOKEN_KEY = "cipher.expoPushToken";
let configured = false;

export async function configureNotifications(): Promise<void> {
  if (configured) return;
  configured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("messages", {
      name: "Messages",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#5865F2",
      sound: "default",
    });

    await Notifications.setNotificationChannelAsync("calls", {
      name: "Calls",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#25D366",
      sound: "default",
    });

    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: "default",
    });
  }
}

export async function registerExpoPushToken(): Promise<string | null> {
  await configureNotifications();

  const perms = await Notifications.getPermissionsAsync();
  if (perms.status !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    if (req.status !== "granted") return null;
  }

  const projectId =
    (Constants as any)?.expoConfig?.extra?.eas?.projectId ||
    (Constants as any)?.easConfig?.projectId ||
    (Constants as any)?.expoConfig?.extra?.projectId;

  const tokenRes = await Notifications.getExpoPushTokenAsync(projectId ? ({ projectId } as any) : undefined);
  const token = String((tokenRes as any)?.data ?? "").trim();
  if (!token) return null;

  const last = (await getItem(TOKEN_KEY)) ?? "";
  if (last !== token) {
    await api.post("/api/users/push-token", { token });
    await setItem(TOKEN_KEY, token);
  }

  return token;
}

export type PushRoute =
  | { kind: "dm"; dmId: string }
  | { kind: "channel"; channelId: string }
  | { kind: "call"; callId: string; dmId: string; type: "voice" | "video"; fromUserId: string; toUserId: string }
  | { kind: "unknown" };

export function parsePushRoute(data: unknown): PushRoute {
  const kind = String((data as any)?.kind ?? "").trim();
  if (kind === "dm") {
    const dmId = String((data as any)?.dmId ?? "").trim();
    if (dmId) return { kind: "dm", dmId };
  }
  if (kind === "channel") {
    const channelId = String((data as any)?.channelId ?? "").trim();
    if (channelId) return { kind: "channel", channelId };
  }
  if (kind === "call") {
    const callId = String((data as any)?.callId ?? "").trim();
    const dmId = String((data as any)?.dmId ?? "").trim();
    const type = (String((data as any)?.type ?? "voice") === "video" ? "video" : "voice") as "voice" | "video";
    const fromUserId = String((data as any)?.fromUserId ?? "").trim();
    const toUserId = String((data as any)?.toUserId ?? "").trim();
    if (callId && dmId && fromUserId && toUserId) {
      return { kind: "call", callId, dmId, type, fromUserId, toUserId };
    }
  }
  return { kind: "unknown" };
}

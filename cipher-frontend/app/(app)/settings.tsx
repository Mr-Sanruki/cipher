import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Platform, Pressable, ScrollView, Share, Switch, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import * as Application from "expo-application";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { Colors } from "../../utils/colors";
import { useAuth } from "../../hooks/useAuth";
import { PremiumScreen } from "../../components/PremiumScreen";
import { PremiumButton } from "../../components/PremiumButton";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { FadeIn } from "../../components/FadeIn";
import { PremiumModal } from "../../components/PremiumModal";
import { uploadFile } from "../../services/files";
import { getJson, setJson } from "../../services/storage";
import { getActiveWorkspaceId, setActiveWorkspaceId } from "../../services/workspaceSelection";
import { deleteWorkspace, listWorkspaces, updateWorkspace } from "../../services/workspaces";
import { listWorkspaceMembers } from "../../services/workspaceMembers";
import {
  changePassword,
  deleteAccount,
  disableTwoFa,
  listSessions,
  requestEmailChange,
  revokeOtherSessions,
  revokeSession,
  setupTwoFa,
  type SessionDto,
  verifyEmailChange,
  verifyTwoFa,
} from "../../services/users";
import type { WorkspaceDto } from "../../types";

export default function SettingsScreen(): JSX.Element {
  const { user, logout, isBusy, updateProfile } = useAuth();

  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmChecked, setDeleteConfirmChecked] = useState(false);

  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [twoFaModalOpen, setTwoFaModalOpen] = useState(false);
  const [sessionsModalOpen, setSessionsModalOpen] = useState(false);

  const [passwordOld, setPasswordOld] = useState("");
  const [passwordNew, setPasswordNew] = useState("");
  const [passwordNew2, setPasswordNew2] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  const [emailNew, setEmailNew] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [emailStep, setEmailStep] = useState<"request" | "verify">("request");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [emailDevOtp, setEmailDevOtp] = useState<string | null>(null);

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [sessionsBusy, setSessionsBusy] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionDto[]>([]);

  const [twoFaEnabled, setTwoFaEnabled] = useState<boolean>(!!user?.twoFaEnabled);
  const [twoFaBusy, setTwoFaBusy] = useState(false);
  const [twoFaError, setTwoFaError] = useState<string | null>(null);
  const [twoFaSecret, setTwoFaSecret] = useState<string | null>(null);
  const [twoFaOtpAuthUrl, setTwoFaOtpAuthUrl] = useState<string | null>(null);
  const [twoFaBackupCodes, setTwoFaBackupCodes] = useState<string[]>([]);
  const [twoFaDevNowCode, setTwoFaDevNowCode] = useState<string | null>(null);
  const [twoFaCode, setTwoFaCode] = useState("");

  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);
  const [workspaceEditOpen, setWorkspaceEditOpen] = useState(false);
  const [workspaceDeleteOpen, setWorkspaceDeleteOpen] = useState(false);

  const successTimerRef = useRef<any>(null);

  const [name, setName] = useState(user?.name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? "");
  const [status, setStatus] = useState<"online" | "away" | "offline">((user?.status as any) ?? "online");
  const [customStatus, setCustomStatus] = useState<string>(String((user as any)?.customStatus ?? ""));

  const [phone, setPhone] = useState<string>(String((user as any)?.phone ?? ""));

  const [bio, setBio] = useState<string>(String((user as any)?.bio ?? ""));

  const [timezone, setTimezone] = useState<string>(String((user as any)?.timezone ?? "System"));
  const [location, setLocation] = useState<string>(String((user as any)?.location ?? ""));

  const [profileBusy, setProfileBusy] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [prefsBusy, setPrefsBusy] = useState(true);
  const [prefsError, setPrefsError] = useState<string | null>(null);

  const [notifyAll, setNotifyAll] = useState(true);
  const [notifyDm, setNotifyDm] = useState(true);
  const [notifyMentions, setNotifyMentions] = useState(true);
  const [notifyReplies, setNotifyReplies] = useState(true);
  const [notifyInvites, setNotifyInvites] = useState(true);
  const [notifyCalls, setNotifyCalls] = useState(true);
  const [notifySound, setNotifySound] = useState(true);
  const [notifyVibration, setNotifyVibration] = useState(true);
  const [dndEnabled, setDndEnabled] = useState(false);
  const [dndFrom, setDndFrom] = useState("22:00");
  const [dndTo, setDndTo] = useState("07:00");
  const [notifySoundName, setNotifySoundName] = useState<"default" | "subtle" | "silent">("default");

  const [debugLogs, setDebugLogs] = useState(false);

  const [storageAutoDelete, setStorageAutoDelete] = useState(false);
  const [storageAutoDownload, setStorageAutoDownload] = useState<"never" | "wifi" | "always">("wifi");

  const [storageBusy, setStorageBusy] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [storageUsageBytes, setStorageUsageBytes] = useState<number | null>(null);
  const [cacheBytes, setCacheBytes] = useState<number | null>(null);
  const [downloadsBytes, setDownloadsBytes] = useState<number | null>(null);

  const storageRefreshInFlightRef = useRef(false);

  const [workspaces, setWorkspaces] = useState<WorkspaceDto[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | null>(null);
  const [activeWorkspaceName, setActiveWorkspaceName] = useState<string>("Workspace");
  const [myRole, setMyRole] = useState<"admin" | "member" | "guest">("member");
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const [workspaceEditName, setWorkspaceEditName] = useState<string>("");
  const [workspaceEditDesc, setWorkspaceEditDesc] = useState<string>("");
  const [workspaceEditError, setWorkspaceEditError] = useState<string | null>(null);
  const [workspaceDeleteChecked, setWorkspaceDeleteChecked] = useState(false);

  const prefsKey = useMemo(() => `cipher.settings.prefs.${user?._id ?? "anon"}`, [user?._id]);
  const profileExtrasKey = useMemo(() => `cipher.settings.profileExtras.${user?._id ?? "anon"}`, [user?._id]);

  useEffect(() => {
    let active = true;
    setPrefsBusy(true);
    setPrefsError(null);

    (async () => {
      try {
        const prefs = await getJson<any>(prefsKey);
        const extras = await getJson<any>(profileExtrasKey);

        if (!active) return;

        if (extras) {
          if (!user?.customStatus && typeof extras.customStatus === "string") setCustomStatus(extras.customStatus);
          if (!user?.phone && typeof extras.phone === "string") setPhone(extras.phone);
          if (!user?.bio && typeof extras.bio === "string") setBio(extras.bio);
          if (!user?.timezone && typeof extras.timezone === "string") setTimezone(extras.timezone);
          if (!user?.location && typeof extras.location === "string") setLocation(extras.location);
        }

        if (prefs) {
          if (typeof prefs.notifyAll === "boolean") setNotifyAll(prefs.notifyAll);
          if (typeof prefs.notifyDm === "boolean") setNotifyDm(prefs.notifyDm);
          if (typeof prefs.notifyMentions === "boolean") setNotifyMentions(prefs.notifyMentions);
          if (typeof prefs.notifyReplies === "boolean") setNotifyReplies(prefs.notifyReplies);
          if (typeof prefs.notifyInvites === "boolean") setNotifyInvites(prefs.notifyInvites);
          if (typeof prefs.notifyCalls === "boolean") setNotifyCalls(prefs.notifyCalls);
          if (typeof prefs.notifySound === "boolean") setNotifySound(prefs.notifySound);
          if (typeof prefs.notifyVibration === "boolean") setNotifyVibration(prefs.notifyVibration);
          if (typeof prefs.dndEnabled === "boolean") setDndEnabled(prefs.dndEnabled);
          if (typeof prefs.dndFrom === "string") setDndFrom(prefs.dndFrom);
          if (typeof prefs.dndTo === "string") setDndTo(prefs.dndTo);
          if (prefs.notifySoundName === "default" || prefs.notifySoundName === "subtle" || prefs.notifySoundName === "silent") setNotifySoundName(prefs.notifySoundName);

          if (typeof prefs.debugLogs === "boolean") setDebugLogs(prefs.debugLogs);

          if (typeof prefs.storageAutoDelete === "boolean") setStorageAutoDelete(prefs.storageAutoDelete);
          if (prefs.storageAutoDownload === "never" || prefs.storageAutoDownload === "wifi" || prefs.storageAutoDownload === "always") setStorageAutoDownload(prefs.storageAutoDownload);
        }
      } catch (e: any) {
        if (!active) return;
        setPrefsError(typeof e?.message === "string" ? e.message : "Failed to load preferences");
      } finally {
        if (!active) return;
        setPrefsBusy(false);
      }
    })();

    return () => {
      active = false;
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
      }
    };
  }, [prefsKey, profileExtrasKey]);

  const persistPrefs = useCallback(async () => {
    await setJson(prefsKey, {
      notifyAll,
      notifyDm,
      notifyMentions,
      notifyReplies,
      notifyInvites,
      notifyCalls,
      notifySound,
      notifyVibration,
      dndEnabled,
      dndFrom,
      dndTo,
      notifySoundName,
      debugLogs,
      storageAutoDelete,
      storageAutoDownload,
    });
  }, [
    debugLogs,
    dndEnabled,
    dndFrom,
    dndTo,
    notifyAll,
    notifyCalls,
    notifyDm,
    notifyInvites,
    notifyMentions,
    notifyReplies,
    notifySound,
    notifySoundName,
    notifyVibration,
    prefsKey,
    storageAutoDelete,
    storageAutoDownload,
  ]);

  const persistProfileExtras = useCallback(async () => {
    await setJson(profileExtrasKey, {
      customStatus,
      phone,
      bio,
      timezone,
      location,
    });
  }, [bio, customStatus, location, phone, profileExtrasKey, timezone]);

  const refreshSessions = useCallback(async () => {
    setSessionsError(null);
    setSessionsBusy(true);
    try {
      const data = await listSessions();
      setSessions(data);
    } catch (e: any) {
      setSessionsError(typeof e?.message === "string" ? e.message : "Failed to load sessions");
    } finally {
      setSessionsBusy(false);
    }
  }, []);

  const formatBytes = useCallback((bytes: number | null) => {
    if (bytes == null) return "—";
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(2)} GB`;
  }, []);

  const getDirSize = useCallback(async (dir: string): Promise<number> => {
    try {
      const info = await FileSystem.getInfoAsync(dir);
      if (!info.exists) return 0;
      if (info.isDirectory) {
        const entries = await FileSystem.readDirectoryAsync(dir);
        let total = 0;
        for (const name of entries) {
          const child = dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`;
          // eslint-disable-next-line no-await-in-loop
          total += await getDirSize(child);
        }
        return total;
      }

      return typeof info.size === "number" ? info.size : 0;
    } catch {
      return 0;
    }
  }, []);

  const downloadsDir = useMemo(() => {
    const base = FileSystem.documentDirectory ?? "";
    return base ? `${base}downloads/` : "";
  }, []);

  const refreshStorageStats = useCallback(async () => {
    if (storageRefreshInFlightRef.current) return;
    setStorageError(null);
    storageRefreshInFlightRef.current = true;
    setStorageBusy(true);

    try {
      const docDir = FileSystem.documentDirectory ?? "";
      const cacheDir = FileSystem.cacheDirectory ?? "";

      if (downloadsDir) {
        await FileSystem.makeDirectoryAsync(downloadsDir, { intermediates: true }).catch(() => {
          // ignore
        });
      }

      const [docSize, cacheSize, dlSize] = await Promise.all([
        docDir ? getDirSize(docDir) : Promise.resolve(0),
        cacheDir ? getDirSize(cacheDir) : Promise.resolve(0),
        downloadsDir ? getDirSize(downloadsDir) : Promise.resolve(0),
      ]);

      setStorageUsageBytes(docSize);
      setCacheBytes(cacheSize);
      setDownloadsBytes(dlSize);
    } catch (e: any) {
      setStorageError(typeof e?.message === "string" ? e.message : "Failed to load storage stats");
    } finally {
      setStorageBusy(false);
      storageRefreshInFlightRef.current = false;
    }
  }, [downloadsDir, getDirSize]);

  useEffect(() => {
    void refreshStorageStats();
  }, [refreshStorageStats]);

  useEffect(() => {
    if (!sessionsModalOpen) return;
    void refreshSessions();
  }, [refreshSessions, sessionsModalOpen]);

  const refreshWorkspace = useCallback(async () => {
    setWorkspaceError(null);
    setWorkspaceBusy(true);
    try {
      const [saved, ws] = await Promise.all([getActiveWorkspaceId(), listWorkspaces()]);
      setWorkspaces(ws);
      const selected = ws.find((w) => w._id === saved) ?? ws[0] ?? null;
      const nextId = selected?._id ?? null;
      setActiveWorkspaceIdState(nextId);
      setActiveWorkspaceName(selected?.name ?? "Workspace");
      if (nextId) {
        await setActiveWorkspaceId(nextId);
      }

      if (nextId && user?._id) {
        try {
          const members = await listWorkspaceMembers(nextId);
          const me = members.find((m) => m.userId === user._id) ?? null;
          if (me?.role === "admin" || me?.role === "member" || me?.role === "guest") {
            setMyRole(me.role);
          } else {
            setMyRole("member");
          }
        } catch {
          setMyRole("member");
        }
      }
    } catch (e: any) {
      setWorkspaceError(typeof e?.message === "string" ? e.message : "Failed to load workspaces");
    } finally {
      setWorkspaceBusy(false);
    }
  }, [user?._id]);

  useEffect(() => {
    void refreshWorkspace();
  }, [refreshWorkspace]);

  const hasChanges = useMemo(() => {
    return name.trim() !== (user?.name ?? "") || avatarUrl.trim() !== (user?.avatarUrl ?? "") || status !== ((user?.status as any) ?? "online");
  }, [avatarUrl, name, status, user?.avatarUrl, user?.name, user?.status]);

  const hasProfileExtras = useMemo(() => {
    return (
      customStatus.trim().length > 0 ||
      phone.trim().length > 0 ||
      bio.trim().length > 0 ||
      timezone.trim().length > 0 ||
      location.trim().length > 0
    );
  }, [bio, customStatus, location, phone, timezone]);

  const onSave = useCallback(async () => {
    setError(null);

    setProfileBusy(true);
    setProfileSaved(false);

    try {
      await updateProfile({
        name: name.trim() ? name.trim() : undefined,
        avatarUrl: avatarUrl.trim() ? avatarUrl.trim() : "",
        status,
        customStatus: customStatus.trim() ? customStatus.trim() : "",
        phone: phone.trim() ? phone.trim() : "",
        bio: bio.trim() ? bio.trim() : "",
        timezone: timezone.trim() ? timezone.trim() : "System",
        location: location.trim() ? location.trim() : "",
      });

      if (hasProfileExtras) {
        await persistProfileExtras();
      }

      setProfileSaved(true);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => {
        setProfileSaved(false);
      }, 2200);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to update profile");
    } finally {
      setProfileBusy(false);
    }
  }, [avatarUrl, hasProfileExtras, name, persistProfileExtras, status, updateProfile]);

  const pickAndUploadAvatar = useCallback(async () => {
    setError(null);
    setProfileSaved(false);

    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError("Media library permission is required to change avatar");
        return;
      }

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
        allowsEditing: true,
        aspect: [1, 1],
      });

      if (res.canceled) return;
      const asset = res.assets?.[0];
      if (!asset?.uri) {
        setError("Invalid image selection");
        return;
      }

      setProfileBusy(true);
      const uploaded = await uploadFile({
        uri: asset.uri,
        name: `avatar_${Date.now()}.jpg`,
        mimeType: "image/jpeg",
        kind: "image",
      });

      setAvatarUrl(uploaded.url);
      await updateProfile({ avatarUrl: uploaded.url });

      setProfileSaved(true);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => {
        setProfileSaved(false);
      }, 2200);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to upload avatar");
    } finally {
      setProfileBusy(false);
    }
  }, [updateProfile]);

  const ensureNotificationReady = useCallback(async (): Promise<boolean> => {
    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "Default",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#5865F2",
          sound: "default",
        });
      }

      const perms = await Notifications.getPermissionsAsync();
      if (perms.status !== "granted") {
        const req = await Notifications.requestPermissionsAsync();
        return req.status === "granted";
      }

      return true;
    } catch {
      return false;
    }
  }, []);

  const copy = useCallback(async (value: string) => {
    try {
      await Clipboard.setStringAsync(value);
    } catch {
      // ignore
    }
  }, []);

  const openUrl = useCallback(async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      // ignore
    }
  }, []);

  const shareText = useCallback(async (text: string) => {
    try {
      await Share.share({ message: text });
    } catch {
      // ignore
    }
  }, []);

  const appVersion = useMemo(() => {
    const v = Application.nativeApplicationVersion ?? "";
    return v ? String(v) : "";
  }, []);

  const buildNumber = useMemo(() => {
    const b = Application.nativeBuildVersion ?? "";
    return b ? String(b) : "";
  }, []);

  const joinDate = useMemo(() => {
    const raw = user?.createdAt;
    if (!raw) return "";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "";
    return d.toDateString();
  }, [user?.createdAt]);

  const accountType = useMemo(() => {
    return "Premium";
  }, []);

  const inviteLink = useMemo(() => {
    const ws = workspaces.find((w) => w._id === activeWorkspaceId) ?? null;
    const code = ws?.verificationCode;
    if (!code) return "";
    return `cipher://workspace/join?code=${encodeURIComponent(code)}`;
  }, [activeWorkspaceId, workspaces]);

  const activeWorkspace = useMemo(() => {
    return workspaces.find((w) => w._id === activeWorkspaceId) ?? null;
  }, [activeWorkspaceId, workspaces]);

  const onSwitchWorkspace = useCallback(
    async (workspaceId: string) => {
      setWorkspaceError(null);
      setWorkspaceBusy(true);
      try {
        await setActiveWorkspaceId(workspaceId);
        await refreshWorkspace();
        setWorkspaceModalOpen(false);
      } catch (e: any) {
        setWorkspaceError(typeof e?.message === "string" ? e.message : "Failed to switch workspace");
      } finally {
        setWorkspaceBusy(false);
      }
    },
    [refreshWorkspace]
  );

  const openEditWorkspace = useCallback(() => {
    setWorkspaceEditError(null);
    setWorkspaceEditName(activeWorkspace?.name ?? "");
    setWorkspaceEditDesc(activeWorkspace?.description ?? "");
    setWorkspaceEditOpen(true);
  }, [activeWorkspace?.description, activeWorkspace?.name]);

  const onSaveWorkspace = useCallback(async () => {
    if (!activeWorkspaceId) return;
    const name = workspaceEditName.trim();
    const description = workspaceEditDesc.trim();
    if (name.length < 2) {
      setWorkspaceEditError("Workspace name is required");
      return;
    }

    setWorkspaceEditError(null);
    setWorkspaceBusy(true);
    try {
      await updateWorkspace(activeWorkspaceId, { name, description: description ? description : undefined });
      await refreshWorkspace();
      setWorkspaceEditOpen(false);
    } catch (e: any) {
      setWorkspaceEditError(typeof e?.message === "string" ? e.message : "Failed to update workspace");
    } finally {
      setWorkspaceBusy(false);
    }
  }, [activeWorkspaceId, refreshWorkspace, workspaceEditDesc, workspaceEditName]);

  const onDeleteWorkspace = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setWorkspaceError(null);
    setWorkspaceBusy(true);
    try {
      await deleteWorkspace(activeWorkspaceId);
      setWorkspaceDeleteOpen(false);
      setWorkspaceDeleteChecked(false);
      await refreshWorkspace();
    } catch (e: any) {
      setWorkspaceError(typeof e?.message === "string" ? e.message : "Failed to delete workspace");
    } finally {
      setWorkspaceBusy(false);
    }
  }, [activeWorkspaceId, refreshWorkspace]);

  const Row = useCallback(
    ({
      title,
      value,
      right,
      onPress,
      disabled,
    }: {
      title: string;
      value?: string;
      right?: React.ReactNode;
      onPress?: () => void;
      disabled?: boolean;
    }) => {
      const clickable = !!onPress && !disabled;
      return (
        <Pressable
          onPress={() => {
            if (clickable && onPress) onPress();
          }}
          disabled={!clickable}
          style={({ pressed }) => ({
            paddingVertical: 12,
            paddingHorizontal: 14,
            backgroundColor: pressed && clickable ? "rgba(255,255,255,0.06)" : "transparent",
            opacity: disabled ? 0.5 : 1,
          })}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: Colors.dark.textPrimary, fontWeight: "800" }}>{title}</Text>
              {value ? <Text style={{ color: Colors.dark.textSecondary, marginTop: 2 }}>{value}</Text> : null}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              {right ? <View>{right}</View> : null}
              {clickable ? <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 18, fontWeight: "900" }}>›</Text> : null}
            </View>
          </View>
        </Pressable>
      );
    },
    []
  );

  const Separator = useCallback(() => <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />, []);

  const Section = useCallback(({ title, children }: { title: string; children: React.ReactNode }) => {
    return (
      <FadeIn>
        <View style={{ marginTop: 18 }}>
          <Text style={{ color: "rgba(255,255,255,0.65)", fontWeight: "900", fontSize: 12, marginBottom: 10, paddingHorizontal: 2, letterSpacing: 0.4 }}>
            {title.toUpperCase()}
          </Text>
          <View
            style={{
              borderRadius: 18,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: "rgba(255,255,255,0.045)",
              overflow: "hidden",
            }}
          >
            {children}
          </View>
        </View>
      </FadeIn>
    );
  }, []);

  return (
    <PremiumScreen padded={false} topPadding={0}>
      <View
        style={{
          paddingTop: 56,
          paddingHorizontal: 16,
          paddingBottom: 14,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.07)",
          backgroundColor: "rgba(0,0,0,0.14)",
        }}
      >
        <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900", fontSize: 18 }}>Settings</Text>
      </View>

      <PremiumModal
        visible={workspaceModalOpen}
        title="Switch Workspace"
        canClose
        presentation="bottom"
        onClose={() => {
          if (!workspaceBusy) setWorkspaceModalOpen(false);
        }}
      >
        {workspaceError ? <Text style={{ color: Colors.dark.textSecondary, marginBottom: 10 }}>{workspaceError}</Text> : null}
        {workspaces.length === 0 ? (
          <Text style={{ color: Colors.dark.textSecondary }}>No workspaces found.</Text>
        ) : (
          <View style={{ gap: 10 }}>
            {workspaces.map((w) => (
              <Row
                key={w._id}
                title={w.name}
                value={w._id === activeWorkspaceId ? "Current" : undefined}
                disabled={workspaceBusy}
                onPress={() => {
                  if (w._id !== activeWorkspaceId) void onSwitchWorkspace(w._id);
                }}
              />
            ))}
          </View>
        )}
      </PremiumModal>

      <PremiumModal
        visible={workspaceEditOpen}
        title="Edit Workspace"
        canClose
        onClose={() => {
          if (!workspaceBusy) setWorkspaceEditOpen(false);
        }}
      >
        {workspaceEditError ? <Text style={{ color: Colors.dark.textSecondary, marginBottom: 10 }}>{workspaceEditError}</Text> : null}

        <Text style={{ color: Colors.dark.textSecondary, marginBottom: 6 }}>Workspace name</Text>
        <View className="rounded-xl border px-4" style={{ backgroundColor: Colors.dark.surface2, borderColor: Colors.dark.border }}>
          <TextInput value={workspaceEditName} onChangeText={setWorkspaceEditName} placeholder="Workspace" placeholderTextColor={Colors.dark.textSecondary} className="h-11" style={{ color: Colors.dark.textPrimary }} />
        </View>

        <Text style={{ color: Colors.dark.textSecondary, marginTop: 10, marginBottom: 6 }}>Description</Text>
        <View className="rounded-xl border px-4" style={{ backgroundColor: Colors.dark.surface2, borderColor: Colors.dark.border }}>
          <TextInput
            value={workspaceEditDesc}
            onChangeText={setWorkspaceEditDesc}
            placeholder="Optional"
            placeholderTextColor={Colors.dark.textSecondary}
            style={{ color: Colors.dark.textPrimary, paddingVertical: 10, minHeight: 70 }}
            multiline
          />
        </View>

        <View style={{ marginTop: 12 }}>
          <PremiumButton
            title={workspaceBusy ? "Saving..." : "Save changes"}
            disabled={workspaceBusy}
            onPress={() => {
              if (!workspaceBusy) void onSaveWorkspace();
            }}
          />
        </View>
      </PremiumModal>

      <PremiumModal
        visible={workspaceDeleteOpen}
        title="Delete Workspace"
        canClose
        onClose={() => {
          if (!workspaceBusy) setWorkspaceDeleteOpen(false);
        }}
      >
        <Text style={{ color: Colors.dark.textSecondary, lineHeight: 20 }}>
          This will permanently delete the workspace "{activeWorkspace?.name ?? "Workspace"}".
        </Text>

        <Pressable
          onPress={() => {
            setWorkspaceDeleteChecked((v) => !v);
          }}
          style={({ pressed }) => ({
            marginTop: 14,
            paddingVertical: 12,
            paddingHorizontal: 12,
            borderRadius: 14,
            backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
          })}
        >
          <Text style={{ color: Colors.dark.textPrimary, fontWeight: "800" }}>{workspaceDeleteChecked ? "[x]" : "[ ]"} I understand this cannot be undone</Text>
        </Pressable>

        {workspaceError ? <Text style={{ color: Colors.dark.textSecondary, marginTop: 10 }}>{workspaceError}</Text> : null}

        <View style={{ marginTop: 12 }}>
          <PremiumButton
            title={workspaceBusy ? "Deleting..." : "Delete workspace"}
            variant="danger"
            disabled={workspaceBusy || !workspaceDeleteChecked}
            onPress={() => {
              if (!workspaceBusy) void onDeleteWorkspace();
            }}
          />
        </View>
      </PremiumModal>

      <ConfirmDialog
        visible={logoutConfirmOpen}
        title="Logout"
        message="Are you sure you want to logout?"
        confirmText="Logout"
        destructive
        busy={isBusy}
        onCancel={() => setLogoutConfirmOpen(false)}
        onConfirm={() => {
          setLogoutConfirmOpen(false);
          if (!isBusy) {
            logout().catch(() => {
              // ignore
            });
          }
        }}
      />

      <PremiumModal
        visible={twoFaModalOpen}
        title="Two-factor Authentication"
        canClose
        onClose={() => {
          if (twoFaBusy) return;
          setTwoFaModalOpen(false);
          setTwoFaError(null);
          setTwoFaSecret(null);
          setTwoFaOtpAuthUrl(null);
          setTwoFaBackupCodes([]);
          setTwoFaDevNowCode(null);
          setTwoFaCode("");
        }}
      >
        <Text style={{ color: Colors.dark.textSecondary, lineHeight: 20 }}>
          Add an extra layer of security using an authenticator app.
        </Text>

        {twoFaError ? <Text style={{ color: Colors.dark.textSecondary, marginTop: 10 }}>{twoFaError}</Text> : null}

        <View style={{ marginTop: 14, borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", backgroundColor: "rgba(255,255,255,0.045)", overflow: "hidden" }}>
          <View style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
            <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900" }}>Status</Text>
            <Text style={{ color: Colors.dark.textSecondary, marginTop: 4 }}>{twoFaEnabled ? "Enabled" : "Not enabled"}</Text>
          </View>
        </View>

        {!twoFaEnabled ? (
          <View style={{ marginTop: 14 }}>
            {twoFaSecret ? (
              <View>
                <View style={{ borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", backgroundColor: "rgba(255,255,255,0.045)", overflow: "hidden" }}>
                  <View style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
                    <Text style={{ color: "rgba(255,255,255,0.65)", fontWeight: "900", fontSize: 12, letterSpacing: 0.3 }}>SETUP</Text>
                    <Text style={{ color: Colors.dark.textSecondary, marginTop: 6, lineHeight: 20 }}>
                      Add this account in Google Authenticator / Microsoft Authenticator.
                    </Text>

                    <View style={{ marginTop: 12 }}>
                      <Text style={{ color: Colors.dark.textSecondary, marginBottom: 6 }}>Secret</Text>
                      <View className="rounded-xl border px-4" style={{ backgroundColor: "rgba(0,0,0,0.18)", borderColor: "rgba(255,255,255,0.10)" }}>
                        <TextInput value={twoFaSecret} editable={false} className="h-11" style={{ color: Colors.dark.textPrimary }} />
                      </View>
                      <View style={{ marginTop: 10 }}>
                        <PremiumButton
                          title="Copy secret"
                          variant="secondary"
                          onPress={() => {
                            void Clipboard.setStringAsync(twoFaSecret);
                          }}
                        />
                      </View>
                      {twoFaOtpAuthUrl ? (
                        <View style={{ marginTop: 10 }}>
                          <PremiumButton
                            title="Open authenticator"
                            variant="secondary"
                            onPress={() => {
                              void Linking.openURL(twoFaOtpAuthUrl);
                            }}
                          />
                        </View>
                      ) : null}
                      {twoFaDevNowCode ? (
                        <Text style={{ color: "rgba(16,185,129,1)", fontWeight: "900", marginTop: 12 }}>
                          Dev current code: {twoFaDevNowCode}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>

                <View style={{ marginTop: 12, borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", backgroundColor: "rgba(255,255,255,0.045)", overflow: "hidden" }}>
                  <View style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
                    <Text style={{ color: "rgba(255,255,255,0.65)", fontWeight: "900", fontSize: 12, letterSpacing: 0.3 }}>BACKUP CODES</Text>
                    <Text style={{ color: Colors.dark.textSecondary, marginTop: 6, lineHeight: 20 }}>
                      Save these codes somewhere safe. Each code can be used once.
                    </Text>
                    <View style={{ marginTop: 10 }}>
                      {twoFaBackupCodes.map((c) => (
                        <Text key={c} style={{ color: Colors.dark.textPrimary, fontWeight: "900", marginTop: 4 }}>
                          {c}
                        </Text>
                      ))}
                    </View>
                    {twoFaBackupCodes.length > 0 ? (
                      <View style={{ marginTop: 10 }}>
                        <PremiumButton
                          title="Copy backup codes"
                          variant="secondary"
                          onPress={() => {
                            void Clipboard.setStringAsync(twoFaBackupCodes.join("\n"));
                          }}
                        />
                      </View>
                    ) : null}
                  </View>
                </View>

                <View style={{ marginTop: 12 }}>
                  <Text style={{ color: Colors.dark.textSecondary, marginBottom: 6 }}>6-digit code</Text>
                  <View className="rounded-xl border px-4" style={{ backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.10)" }}>
                    <TextInput
                      value={twoFaCode}
                      onChangeText={setTwoFaCode}
                      placeholder="123456"
                      placeholderTextColor={Colors.dark.textSecondary}
                      className="h-11"
                      style={{ color: Colors.dark.textPrimary }}
                      keyboardType={Platform.OS === "ios" ? "number-pad" : "numeric"}
                      editable={!twoFaBusy}
                    />
                  </View>
                </View>

                <View style={{ marginTop: 14 }}>
                  <PremiumButton
                    title={twoFaBusy ? "Enabling..." : "Enable 2FA"}
                    disabled={twoFaBusy}
                    onPress={() => {
                      if (twoFaBusy) return;
                      const code = twoFaCode.trim();
                      if (!code) {
                        setTwoFaError("Enter the 6-digit code");
                        return;
                      }
                      setTwoFaError(null);
                      setTwoFaBusy(true);
                      verifyTwoFa({ code })
                        .then(() => {
                          setTwoFaEnabled(true);
                          setTwoFaModalOpen(false);
                          setTwoFaSecret(null);
                          setTwoFaOtpAuthUrl(null);
                          setTwoFaBackupCodes([]);
                          setTwoFaCode("");
                        })
                        .catch((e: any) => {
                          setTwoFaError(typeof e?.message === "string" ? e.message : "Failed to enable 2FA");
                        })
                        .finally(() => setTwoFaBusy(false));
                    }}
                  />
                </View>
              </View>
            ) : (
              <PremiumButton
                title={twoFaBusy ? "Preparing..." : "Set up 2FA"}
                disabled={twoFaBusy}
                onPress={() => {
                  if (twoFaBusy) return;
                  setTwoFaError(null);
                  setTwoFaBusy(true);
                  setupTwoFa()
                    .then((res) => {
                      setTwoFaSecret(res.secret);
                      setTwoFaOtpAuthUrl(res.otpauthUrl);
                      setTwoFaBackupCodes(res.backupCodes);
                      setTwoFaDevNowCode(typeof res.devNowCode === "string" ? res.devNowCode : null);
                    })
                    .catch((e: any) => {
                      setTwoFaError(typeof e?.message === "string" ? e.message : "Failed to start 2FA setup");
                    })
                    .finally(() => setTwoFaBusy(false));
                }}
              />
            )}
          </View>
        ) : (
          <View style={{ marginTop: 14 }}>
            <Text style={{ color: Colors.dark.textSecondary, lineHeight: 20 }}>
              To disable 2FA, enter a 6-digit code from your authenticator app or a backup code.
            </Text>

            <View style={{ marginTop: 12 }}>
              <Text style={{ color: Colors.dark.textSecondary, marginBottom: 6 }}>Code</Text>
              <View className="rounded-xl border px-4" style={{ backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.10)" }}>
                <TextInput
                  value={twoFaCode}
                  onChangeText={setTwoFaCode}
                  placeholder="123456 or backup code"
                  placeholderTextColor={Colors.dark.textSecondary}
                  className="h-11"
                  style={{ color: Colors.dark.textPrimary }}
                  editable={!twoFaBusy}
                />
              </View>
            </View>

            <View style={{ marginTop: 14 }}>
              <PremiumButton
                title={twoFaBusy ? "Disabling..." : "Disable 2FA"}
                variant="danger"
                disabled={twoFaBusy}
                onPress={() => {
                  if (twoFaBusy) return;
                  const code = twoFaCode.trim();
                  if (!code) {
                    setTwoFaError("Enter a code");
                    return;
                  }
                  setTwoFaError(null);
                  setTwoFaBusy(true);
                  disableTwoFa({ code })
                    .then(() => {
                      setTwoFaEnabled(false);
                      setTwoFaModalOpen(false);
                      setTwoFaCode("");
                    })
                    .catch((e: any) => {
                      setTwoFaError(typeof e?.message === "string" ? e.message : "Failed to disable 2FA");
                    })
                    .finally(() => setTwoFaBusy(false));
                }}
              />
            </View>
          </View>
        )}
      </PremiumModal>

      <PremiumModal
        visible={sessionsModalOpen}
        title="Active Sessions"
        canClose
        onClose={() => {
          if (!sessionsBusy) setSessionsModalOpen(false);
        }}
      >
        <Text style={{ color: Colors.dark.textSecondary, lineHeight: 20 }}>
          Manage devices that are signed into your account.
        </Text>

        {sessionsError ? <Text style={{ color: Colors.dark.textSecondary, marginTop: 10 }}>{sessionsError}</Text> : null}

        <View style={{ marginTop: 14, borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", backgroundColor: "rgba(255,255,255,0.045)", overflow: "hidden" }}>
          {sessionsBusy ? (
            <View style={{ paddingHorizontal: 14, paddingVertical: 14 }}>
              <Text style={{ color: Colors.dark.textSecondary, fontWeight: "800" }}>Loading…</Text>
            </View>
          ) : sessions.length === 0 ? (
            <View style={{ paddingHorizontal: 14, paddingVertical: 14 }}>
              <Text style={{ color: Colors.dark.textSecondary, fontWeight: "800" }}>No sessions</Text>
            </View>
          ) : (
            sessions.map((s, idx) => {
              const isLast = idx === sessions.length - 1;
              const isRevoked = !!s.revokedAt;
              const subtitle = [
                s.ip ? `IP: ${s.ip}` : "",
                s.lastUsedAt ? `Last used: ${new Date(s.lastUsedAt).toLocaleString()}` : "",
              ]
                .filter(Boolean)
                .join(" • ");

              return (
                <View key={s._id}>
                  <View style={{ paddingHorizontal: 14, paddingVertical: 12, opacity: isRevoked ? 0.6 : 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900" }} numberOfLines={2}>
                          {s.userAgent || "Unknown device"}
                        </Text>
                        {subtitle ? <Text style={{ color: Colors.dark.textSecondary, marginTop: 4 }}>{subtitle}</Text> : null}
                        <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                          {s.isCurrent ? (
                            <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(88,101,242,0.14)", borderWidth: 1, borderColor: "rgba(88,101,242,0.22)" }}>
                              <Text style={{ color: Colors.primaryBlue, fontWeight: "900", fontSize: 12 }}>This device</Text>
                            </View>
                          ) : null}
                          {isRevoked ? (
                            <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(239,68,68,0.10)", borderWidth: 1, borderColor: "rgba(239,68,68,0.18)" }}>
                              <Text style={{ color: Colors.errorRed, fontWeight: "900", fontSize: 12 }}>Revoked</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>

                      {!s.isCurrent && !isRevoked ? (
                        <Pressable
                          onPress={() => {
                            if (sessionsBusy) return;
                            setSessionsBusy(true);
                            setSessionsError(null);
                            revokeSession({ sessionId: s._id })
                              .then(() => refreshSessions())
                              .catch((e: any) => {
                                setSessionsError(typeof e?.message === "string" ? e.message : "Failed to revoke session");
                              })
                              .finally(() => setSessionsBusy(false));
                          }}
                          style={({ pressed }) => ({
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                            borderRadius: 12,
                            backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
                            borderWidth: 1,
                            borderColor: "rgba(255,255,255,0.10)",
                          })}
                        >
                          <Text style={{ color: Colors.errorRed, fontWeight: "900" }}>Revoke</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                  {!isLast ? <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} /> : null}
                </View>
              );
            })
          )}
        </View>

        <View style={{ marginTop: 14 }}>
          <PremiumButton
            title={sessionsBusy ? "Working..." : "Logout other devices"}
            variant="secondary"
            disabled={sessionsBusy}
            onPress={() => {
              if (sessionsBusy) return;
              setSessionsBusy(true);
              setSessionsError(null);
              revokeOtherSessions()
                .then(() => refreshSessions())
                .catch((e: any) => {
                  setSessionsError(typeof e?.message === "string" ? e.message : "Failed to revoke other sessions");
                })
                .finally(() => setSessionsBusy(false));
            }}
          />

          <View style={{ marginTop: 10 }}>
            <PremiumButton
              title={isBusy ? "Logging out..." : "Logout this device"}
              variant="danger"
              disabled={isBusy || sessionsBusy}
              onPress={() => {
                setSessionsModalOpen(false);
                void logout();
              }}
            />
          </View>
        </View>
      </PremiumModal>

      <PremiumModal
        visible={emailModalOpen}
        title="Change Email"
        canClose
        onClose={() => {
          if (emailBusy) return;
          setEmailModalOpen(false);
          setEmailError(null);
          setEmailSent(false);
          setEmailStep("request");
          setEmailDevOtp(null);
          setEmailPassword("");
          setEmailOtp("");
          setEmailNew("");
        }}
      >
        <Text style={{ color: Colors.dark.textSecondary, lineHeight: 20 }}>
          We’ll send a verification code to your new email address.
        </Text>

        {emailError ? <Text style={{ color: Colors.dark.textSecondary, marginTop: 10 }}>{emailError}</Text> : null}

        {emailStep === "request" ? (
          <View style={{ marginTop: 14 }}>
            <Text style={{ color: Colors.dark.textSecondary, marginBottom: 6 }}>New email</Text>
            <View className="rounded-xl border px-4" style={{ backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.10)" }}>
              <TextInput
                value={emailNew}
                onChangeText={setEmailNew}
                placeholder="name@example.com"
                placeholderTextColor={Colors.dark.textSecondary}
                className="h-11"
                style={{ color: Colors.dark.textPrimary }}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!emailBusy}
              />
            </View>

            <View style={{ marginTop: 12 }}>
              <Text style={{ color: Colors.dark.textSecondary, marginBottom: 6 }}>Confirm password</Text>
              <View className="rounded-xl border px-4" style={{ backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.10)" }}>
                <TextInput
                  value={emailPassword}
                  onChangeText={setEmailPassword}
                  placeholder="••••••••"
                  placeholderTextColor={Colors.dark.textSecondary}
                  className="h-11"
                  style={{ color: Colors.dark.textPrimary }}
                  secureTextEntry
                  editable={!emailBusy}
                />
              </View>
            </View>

            {emailDevOtp ? (
              <Text style={{ color: "rgba(16,185,129,1)", fontWeight: "900", marginTop: 10 }}>
                Dev OTP: {emailDevOtp}
              </Text>
            ) : null}

            {emailSent ? (
              <Text style={{ color: "rgba(16,185,129,1)", fontWeight: "900", marginTop: 10 }}>
                Code sent. Check your inbox.
              </Text>
            ) : null}

            <View style={{ marginTop: 14 }}>
              <PremiumButton
                title={emailBusy ? "Sending..." : "Send verification code"}
                disabled={emailBusy}
                onPress={() => {
                  if (emailBusy) return;
                  setEmailError(null);
                  setEmailDevOtp(null);
                  setEmailSent(false);
                  const newEmail = emailNew.trim().toLowerCase();
                  const pwd = emailPassword.trim();
                  if (!newEmail) {
                    setEmailError("Enter a new email");
                    return;
                  }
                  if (!pwd) {
                    setEmailError("Enter your password");
                    return;
                  }
                  setEmailBusy(true);
                  requestEmailChange({ newEmail, password: pwd })
                    .then((res) => {
                      setEmailSent(true);
                      if (res?.devOtp) setEmailDevOtp(res.devOtp);
                      setEmailStep("verify");
                    })
                    .catch((e: any) => {
                      setEmailError(typeof e?.message === "string" ? e.message : "Failed to send code");
                    })
                    .finally(() => {
                      setEmailBusy(false);
                    });
                }}
              />
            </View>
          </View>
        ) : (
          <View style={{ marginTop: 14 }}>
            <Text style={{ color: Colors.dark.textSecondary, marginBottom: 6 }}>New email</Text>
            <View className="rounded-xl border px-4" style={{ backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.10)", opacity: 0.9 }}>
              <TextInput value={emailNew.trim()} editable={false} className="h-11" style={{ color: Colors.dark.textPrimary }} />
            </View>

            <View style={{ marginTop: 12 }}>
              <Text style={{ color: Colors.dark.textSecondary, marginBottom: 6 }}>Verification code</Text>
              <View className="rounded-xl border px-4" style={{ backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.10)" }}>
                <TextInput
                  value={emailOtp}
                  onChangeText={setEmailOtp}
                  placeholder="6-digit code"
                  placeholderTextColor={Colors.dark.textSecondary}
                  className="h-11"
                  style={{ color: Colors.dark.textPrimary }}
                  keyboardType={Platform.OS === "ios" ? "number-pad" : "numeric"}
                  editable={!emailBusy}
                />
              </View>
            </View>

            <View style={{ marginTop: 14 }}>
              <PremiumButton
                title={emailBusy ? "Verifying..." : "Verify & update email"}
                disabled={emailBusy}
                onPress={() => {
                  if (emailBusy) return;
                  setEmailError(null);
                  const newEmail = emailNew.trim().toLowerCase();
                  const otp = emailOtp.trim();
                  if (!otp) {
                    setEmailError("Enter the verification code");
                    return;
                  }
                  setEmailBusy(true);
                  verifyEmailChange({ newEmail, otp })
                    .then(() => {
                      setEmailModalOpen(false);
                      setEmailError(null);
                      setEmailSent(false);
                      setEmailStep("request");
                      setEmailDevOtp(null);
                      setEmailPassword("");
                      setEmailOtp("");
                      setEmailNew("");
                      return logout();
                    })
                    .catch((e: any) => {
                      setEmailError(typeof e?.message === "string" ? e.message : "Failed to verify code");
                    })
                    .finally(() => {
                      setEmailBusy(false);
                    });
                }}
              />

              <View style={{ marginTop: 10 }}>
                <PremiumButton
                  title={emailBusy ? "Please wait..." : "Resend code"}
                  variant="secondary"
                  disabled={emailBusy}
                  onPress={() => {
                    if (emailBusy) return;
                    setEmailError(null);
                    setEmailDevOtp(null);
                    const newEmail = emailNew.trim().toLowerCase();
                    const pwd = emailPassword.trim();
                    if (!newEmail || !pwd) {
                      setEmailError("Go back and enter email + password again");
                      return;
                    }
                    setEmailBusy(true);
                    requestEmailChange({ newEmail, password: pwd })
                      .then((res) => {
                        setEmailSent(true);
                        if (res?.devOtp) setEmailDevOtp(res.devOtp);
                      })
                      .catch((e: any) => {
                        setEmailError(typeof e?.message === "string" ? e.message : "Failed to resend code");
                      })
                      .finally(() => {
                        setEmailBusy(false);
                      });
                  }}
                />
              </View>

              <View style={{ marginTop: 10 }}>
                <PremiumButton
                  title="Back"
                  variant="secondary"
                  disabled={emailBusy}
                  onPress={() => {
                    if (emailBusy) return;
                    setEmailError(null);
                    setEmailOtp("");
                    setEmailStep("request");
                  }}
                />
              </View>
            </View>
          </View>
        )}
      </PremiumModal>

      <PremiumModal
        visible={passwordModalOpen}
        title="Change Password"
        canClose
        onClose={() => {
          if (!passwordBusy) setPasswordModalOpen(false);
        }}
      >
        <Text style={{ color: Colors.dark.textSecondary, lineHeight: 20 }}>
          Use a strong password (min 8 characters).
        </Text>

        {passwordError ? <Text style={{ color: Colors.dark.textSecondary, marginTop: 10 }}>{passwordError}</Text> : null}
        {passwordSaved ? <Text style={{ color: "rgba(16,185,129,1)", fontWeight: "900", marginTop: 10 }}>Password updated</Text> : null}

        <View style={{ marginTop: 14 }}>
          <Text style={{ color: Colors.dark.textSecondary, marginBottom: 6 }}>Current password</Text>
          <View className="rounded-xl border px-4" style={{ backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.10)" }}>
            <TextInput value={passwordOld} onChangeText={setPasswordOld} placeholder="••••••••" placeholderTextColor={Colors.dark.textSecondary} className="h-11" style={{ color: Colors.dark.textPrimary }} secureTextEntry />
          </View>
        </View>

        <View style={{ marginTop: 12 }}>
          <Text style={{ color: Colors.dark.textSecondary, marginBottom: 6 }}>New password</Text>
          <View className="rounded-xl border px-4" style={{ backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.10)" }}>
            <TextInput value={passwordNew} onChangeText={setPasswordNew} placeholder="Min 8 characters" placeholderTextColor={Colors.dark.textSecondary} className="h-11" style={{ color: Colors.dark.textPrimary }} secureTextEntry />
          </View>
        </View>

        <View style={{ marginTop: 12 }}>
          <Text style={{ color: Colors.dark.textSecondary, marginBottom: 6 }}>Confirm new password</Text>
          <View className="rounded-xl border px-4" style={{ backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.10)" }}>
            <TextInput value={passwordNew2} onChangeText={setPasswordNew2} placeholder="Repeat new password" placeholderTextColor={Colors.dark.textSecondary} className="h-11" style={{ color: Colors.dark.textPrimary }} secureTextEntry />
          </View>
        </View>

        <View style={{ marginTop: 14 }}>
          <PremiumButton
            title={passwordBusy ? "Updating..." : "Update password"}
            disabled={passwordBusy}
            onPress={() => {
              if (passwordBusy) return;
              setPasswordError(null);
              setPasswordSaved(false);
              const oldP = passwordOld.trim();
              const newP = passwordNew.trim();
              const newP2 = passwordNew2.trim();
              if (!oldP || !newP || !newP2) {
                setPasswordError("Fill all fields");
                return;
              }
              if (newP.length < 8) {
                setPasswordError("New password must be at least 8 characters");
                return;
              }
              if (newP !== newP2) {
                setPasswordError("New passwords do not match");
                return;
              }
              setPasswordBusy(true);
              changePassword({ oldPassword: oldP, newPassword: newP })
                .then(() => {
                  setPasswordSaved(true);
                  setPasswordOld("");
                  setPasswordNew("");
                  setPasswordNew2("");
                  setTimeout(() => {
                    setPasswordModalOpen(false);
                    setPasswordSaved(false);
                  }, 450);
                })
                .catch((e: any) => {
                  setPasswordError(typeof e?.message === "string" ? e.message : "Failed to change password");
                })
                .finally(() => {
                  setPasswordBusy(false);
                });
            }}
          />
        </View>
      </PremiumModal>

      <PremiumModal
        visible={deleteConfirmOpen}
        title="Delete Account"
        canClose
        onClose={() => {
          if (!isBusy) setDeleteConfirmOpen(false);
        }}
      >
        <Text style={{ color: Colors.dark.textSecondary, lineHeight: 20 }}>
          This is irreversible. Deleting your account will remove access to your data.
        </Text>

        {deleteError ? <Text style={{ color: Colors.dark.textSecondary, marginTop: 10 }}>{deleteError}</Text> : null}

        <View style={{ marginTop: 14 }}>
          <Text style={{ color: Colors.dark.textSecondary, marginBottom: 6 }}>Confirm password</Text>
          <View className="rounded-xl border px-4" style={{ backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.10)" }}>
            <TextInput value={deletePassword} onChangeText={setDeletePassword} placeholder="••••••••" placeholderTextColor={Colors.dark.textSecondary} className="h-11" style={{ color: Colors.dark.textPrimary }} secureTextEntry editable={!deleteBusy} />
          </View>
        </View>

        <Pressable
          onPress={() => {
            setDeleteConfirmChecked((v) => !v);
          }}
          style={({ pressed }) => ({
            marginTop: 14,
            paddingVertical: 12,
            paddingHorizontal: 12,
            borderRadius: 14,
            backgroundColor: pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
          })}
        >
          <Text style={{ color: Colors.dark.textPrimary, fontWeight: "800" }}>{deleteConfirmChecked ? "[x]" : "[ ]"} I understand this cannot be undone</Text>
        </Pressable>

        <View style={{ marginTop: 12 }}>
          <PremiumButton
            title={deleteBusy ? "Deleting..." : "Delete account"}
            variant="danger"
            disabled={!deleteConfirmChecked || deleteBusy}
            onPress={() => {
              if (deleteBusy) return;
              const pwd = deletePassword.trim();
              if (!pwd) {
                setDeleteError("Enter your password");
                return;
              }
              setDeleteError(null);
              setDeleteBusy(true);
              deleteAccount({ password: pwd })
                .then(() => {
                  setDeleteConfirmOpen(false);
                  setDeleteConfirmChecked(false);
                  setDeletePassword("");
                  return logout();
                })
                .catch((e: any) => {
                  setDeleteError(typeof e?.message === "string" ? e.message : "Failed to delete account");
                })
                .finally(() => {
                  setDeleteBusy(false);
                });
            }}
          />
        </View>
      </PremiumModal>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 60 }}>
        <FadeIn>
          <View
            style={{
              borderRadius: 22,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: "rgba(0,0,0,0.18)",
              padding: 16,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 999,
                  backgroundColor: "rgba(255,255,255,0.06)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={{ width: 60, height: 60 }} />
                ) : (
                  <Text style={{ color: Colors.dark.textSecondary, fontWeight: "900", fontSize: 18 }}>{(user?.name ?? "?").slice(0, 1).toUpperCase()}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: Colors.dark.textPrimary, fontWeight: "900", fontSize: 18 }} numberOfLines={1}>
                  {user?.name ?? "Unknown"}
                </Text>
                <Text style={{ color: "rgba(255,255,255,0.65)", marginTop: 4 }} numberOfLines={1}>
                  {user?.email ?? ""}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
                  <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(37,211,102,0.14)", borderWidth: 1, borderColor: "rgba(37,211,102,0.22)" }}>
                    <Text style={{ color: "rgba(37,211,102,1)", fontWeight: "900", fontSize: 12 }}>{status}</Text>
                  </View>
                  {customStatus.trim() ? (
                    <Text style={{ color: "rgba(255,255,255,0.65)", fontWeight: "800" }} numberOfLines={1}>
                      {customStatus.trim()}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
          </View>
        </FadeIn>

        <Section title="Profile">
          {error ? <Text style={{ color: Colors.dark.textSecondary, paddingHorizontal: 14, paddingTop: 12 }}>{error}</Text> : null}
          {profileSaved ? <Text style={{ color: "rgba(16,185,129,1)", fontWeight: "900", paddingHorizontal: 14, paddingTop: 12 }}>Profile updated</Text> : null}

          <Row
            title="Profile picture"
            value={avatarUrl ? "Tap to upload/change" : "No avatar"}
            onPress={() => {
              void pickAndUploadAvatar();
            }}
            right={<Text style={{ color: Colors.primaryBlue, fontWeight: "900" }}>{profileBusy ? "Uploading..." : "Change"}</Text>}
            disabled={profileBusy}
          />
          <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />
          <Row
            title="Copy avatar URL"
            value={avatarUrl ? "Tap to copy" : "No avatar"}
            onPress={() => {
              if (avatarUrl) void copy(avatarUrl);
            }}
            right={<Text style={{ color: avatarUrl ? Colors.primaryBlue : Colors.dark.textSecondary, fontWeight: "900" }}>Copy</Text>}
            disabled={!avatarUrl}
          />
          <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />

          <View style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
            <Text style={{ color: Colors.dark.textSecondary, marginBottom: 6 }}>User name</Text>
            <View className="rounded-xl border px-4" style={{ backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.10)" }}>
              <TextInput value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={Colors.dark.textSecondary} className="h-11" style={{ color: Colors.dark.textPrimary }} />
            </View>
          </View>

          <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />

          <View style={{ paddingHorizontal: 14, paddingVertical: 12, opacity: 0.85 }}>
            <Text style={{ color: Colors.dark.textSecondary, marginBottom: 6 }}>Email address</Text>
            <View className="rounded-xl border px-4" style={{ backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.10)" }}>
              <TextInput value={user?.email ?? ""} editable={false} className="h-11" style={{ color: Colors.dark.textPrimary }} />
            </View>
          </View>

          <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />

          <View style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
            <Text style={{ color: "rgba(255,255,255,0.65)", fontWeight: "900", fontSize: 12, marginBottom: 10, letterSpacing: 0.3 }}>
              STATUS
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {(["online", "away", "offline"] as const).map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setStatus(s)}
                  style={({ pressed }) => ({
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: status === s ? Colors.primaryBlue : "rgba(255,255,255,0.12)",
                    backgroundColor: status === s ? "rgba(88,101,242,0.16)" : pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                  })}
                >
                  <Text style={{ color: status === s ? Colors.primaryBlue : "rgba(255,255,255,0.75)", fontWeight: "900" }}>{s}</Text>
                </Pressable>
              ))}
            </View>

            <View style={{ marginTop: 12 }}>
              <Text style={{ color: Colors.dark.textSecondary, marginBottom: 6 }}>Custom status</Text>
              <View className="rounded-xl border px-4" style={{ backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.10)" }}>
                <TextInput value={customStatus} onChangeText={setCustomStatus} placeholder="In a meeting" placeholderTextColor={Colors.dark.textSecondary} className="h-11" style={{ color: Colors.dark.textPrimary }} />
              </View>
            </View>
          </View>

          <Separator />

          <View style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
            <Text style={{ color: "rgba(255,255,255,0.65)", fontWeight: "900", fontSize: 12, marginBottom: 10, letterSpacing: 0.3 }}>
              ABOUT
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: Colors.dark.textSecondary, marginBottom: 6 }}>Phone</Text>
                <View className="rounded-xl border px-4" style={{ backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.10)" }}>
                  <TextInput value={phone} onChangeText={setPhone} placeholder="+91..." placeholderTextColor={Colors.dark.textSecondary} className="h-11" style={{ color: Colors.dark.textPrimary }} keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "phone-pad"} />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: Colors.dark.textSecondary, marginBottom: 6 }}>Location</Text>
                <View className="rounded-xl border px-4" style={{ backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.10)" }}>
                  <TextInput value={location} onChangeText={setLocation} placeholder="City, Country" placeholderTextColor={Colors.dark.textSecondary} className="h-11" style={{ color: Colors.dark.textPrimary }} />
                </View>
              </View>
            </View>

            <Text style={{ color: Colors.dark.textSecondary, marginBottom: 6, marginTop: 12 }}>Bio</Text>
            <View className="rounded-xl border px-4" style={{ backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.10)" }}>
              <TextInput value={bio} onChangeText={setBio} placeholder="Tell people about you" placeholderTextColor={Colors.dark.textSecondary} style={{ color: Colors.dark.textPrimary, paddingVertical: 10, minHeight: 74 }} multiline />
            </View>

            <Text style={{ color: Colors.dark.textSecondary, marginBottom: 8, marginTop: 12 }}>Timezone</Text>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {(["System", "UTC", "Asia/Kolkata", "America/New_York"] as const).map((tz) => (
                <Pressable
                  key={tz}
                  onPress={() => setTimezone(tz)}
                  style={({ pressed }) => ({
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: timezone === tz ? Colors.primaryBlue : "rgba(255,255,255,0.12)",
                    backgroundColor: timezone === tz ? "rgba(88,101,242,0.16)" : pressed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                  })}
                >
                  <Text style={{ color: timezone === tz ? Colors.primaryBlue : "rgba(255,255,255,0.75)", fontWeight: "900" }}>{tz}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Separator />

          <View style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
            <PremiumButton
              title={profileBusy || isBusy ? "Saving..." : "Save profile"}
              disabled={profileBusy || isBusy || (!hasChanges && !hasProfileExtras)}
              onPress={() => {
                if (!profileBusy && !isBusy) void onSave();
              }}
            />
          </View>
        </Section>

        <Section title="Account">
          <Row title="Account type" value={accountType} />
          <Separator />
          <Row title="Join date" value={joinDate || "—"} />
          <Separator />
          <Row
            title="Account ID"
            value={user?._id ?? "—"}
            onPress={() => {
              if (user?._id) void copy(user._id);
            }}
            right={<Text style={{ color: Colors.primaryBlue, fontWeight: "900" }}>Copy</Text>}
          />
          <Separator />
          <Row
            title="Change password"
            value="Update your password"
            onPress={() => setPasswordModalOpen(true)}
            right={<Text style={{ color: Colors.primaryBlue, fontWeight: "900" }}>Open</Text>}
          />
          <Separator />
          <Row
            title="Change email"
            value="Verify via OTP"
            onPress={() => setEmailModalOpen(true)}
            right={<Text style={{ color: Colors.primaryBlue, fontWeight: "900" }}>Open</Text>}
          />
          <Separator />
          <Row
            title="Delete account"
            value="Destructive"
            onPress={() => {
              setDeleteConfirmChecked(false);
              setDeleteConfirmOpen(true);
            }}
            right={<Text style={{ color: Colors.errorRed, fontWeight: "900" }}>Danger</Text>}
          />
        </Section>

        <Section title="Workspace">
          <Row title="Current workspace" value={workspaceBusy ? "Loading..." : activeWorkspaceName} />
          <Separator />
          <Row title="My role" value={myRole} />
          <Separator />
          <Row
            title="Switch workspace"
            value={workspaces.length > 0 ? `${workspaces.length} available` : "No workspaces"}
            onPress={() => {
              if (!workspaceBusy) setWorkspaceModalOpen(true);
            }}
            right={<Text style={{ color: Colors.primaryBlue, fontWeight: "900" }}>Open</Text>}
          />
          <Separator />
          <Row
            title="Edit workspace"
            value={activeWorkspaceId ? "Rename / update description" : "No workspace"}
            disabled={!activeWorkspaceId || workspaceBusy}
            onPress={() => {
              if (!workspaceBusy && activeWorkspaceId) openEditWorkspace();
            }}
            right={<Text style={{ color: activeWorkspaceId ? Colors.primaryBlue : Colors.dark.textSecondary, fontWeight: "900" }}>Edit</Text>}
          />
          <Separator />
          <Row
            title="Delete workspace"
            value={activeWorkspaceId ? "Destructive" : "No workspace"}
            disabled={!activeWorkspaceId || workspaceBusy}
            onPress={() => {
              setWorkspaceDeleteChecked(false);
              setWorkspaceDeleteOpen(true);
            }}
            right={<Text style={{ color: Colors.errorRed, fontWeight: "900" }}>Delete</Text>}
          />
          <Separator />
          <Row
            title="Workspace invite link"
            value={inviteLink ? "Tap to copy" : "No invite code"}
            disabled={!inviteLink}
            onPress={() => {
              if (inviteLink) void copy(inviteLink);
            }}
            right={<Text style={{ color: inviteLink ? Colors.primaryBlue : Colors.dark.textSecondary, fontWeight: "900" }}>Copy</Text>}
          />
          <Separator />
          <Row
            title="Share invite link"
            value={inviteLink ? "Send to someone" : "No invite code"}
            disabled={!inviteLink}
            onPress={() => {
              if (inviteLink) void shareText(inviteLink);
            }}
            right={<Text style={{ color: inviteLink ? Colors.primaryBlue : Colors.dark.textSecondary, fontWeight: "900" }}>Share</Text>}
          />
          <Separator />
          <Row
            title="My permissions"
            value={myRole === "admin" ? "Admin access" : myRole === "guest" ? "Limited" : "Member"}
          />
          <Separator />
          <Row
            title="Workspace admin"
            value={myRole === "admin" ? "Available" : "Not an admin"}
            disabled={myRole !== "admin"}
          />
        </Section>

        <Section title="Notifications">
          <Row
            title="All notifications"
            value={notifyAll ? "On" : "Off"}
            right={<Switch value={notifyAll} onValueChange={(v) => { setNotifyAll(v); void persistPrefs(); }} />}
          />

          <Separator />

          <Row title="Direct messages" value={notifyDm ? "On" : "Off"} right={<Switch value={notifyDm} onValueChange={(v) => { setNotifyDm(v); void persistPrefs(); }} />} />
          <Separator />
          <Row title="Channel mentions" value={notifyMentions ? "On" : "Off"} right={<Switch value={notifyMentions} onValueChange={(v) => { setNotifyMentions(v); void persistPrefs(); }} />} />
          <Separator />
          <Row title="Replies" value={notifyReplies ? "On" : "Off"} right={<Switch value={notifyReplies} onValueChange={(v) => { setNotifyReplies(v); void persistPrefs(); }} />} />
          <Separator />
          <Row title="Workspace invites" value={notifyInvites ? "On" : "Off"} right={<Switch value={notifyInvites} onValueChange={(v) => { setNotifyInvites(v); void persistPrefs(); }} />} />
          <Separator />
          <Row title="Calls" value={notifyCalls ? "On" : "Off"} right={<Switch value={notifyCalls} onValueChange={(v) => { setNotifyCalls(v); void persistPrefs(); }} />} />
          <Separator />
          <Row title="Sound" value={notifySound ? "On" : "Off"} right={<Switch value={notifySound} onValueChange={(v) => { setNotifySound(v); void persistPrefs(); }} />} />
          <Separator />
          <Row title="Vibration" value={notifyVibration ? "On" : "Off"} right={<Switch value={notifyVibration} onValueChange={(v) => { setNotifyVibration(v); void persistPrefs(); }} />} />

          <Separator />

          <Row
            title="Do Not Disturb"
            value={dndEnabled ? `On (${dndFrom}–${dndTo})` : "Off"}
            right={<Switch value={dndEnabled} onValueChange={(v) => { setDndEnabled(v); void persistPrefs(); }} />}
          />

          {dndEnabled ? (
            <View style={{ paddingHorizontal: 14, paddingTop: 8, paddingBottom: 12 }}>
              <View
                style={{
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  backgroundColor: "rgba(255,255,255,0.04)",
                  padding: 12,
                }}
              >
                <Text style={{ color: "rgba(255,255,255,0.65)", fontWeight: "900", fontSize: 12, marginBottom: 10, letterSpacing: 0.3 }}>
                  QUIET HOURS
                </Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: Colors.dark.textSecondary, marginBottom: 6 }}>From</Text>
                    <View className="rounded-xl border px-4" style={{ backgroundColor: "rgba(0,0,0,0.18)", borderColor: "rgba(255,255,255,0.10)" }}>
                      <TextInput
                        value={dndFrom}
                        onChangeText={(v) => {
                          setDndFrom(v);
                        }}
                        onBlur={() => {
                          void persistPrefs();
                        }}
                        className="h-11"
                        style={{ color: Colors.dark.textPrimary }}
                        placeholder="22:00"
                        placeholderTextColor={Colors.dark.textSecondary}
                      />
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: Colors.dark.textSecondary, marginBottom: 6 }}>To</Text>
                    <View className="rounded-xl border px-4" style={{ backgroundColor: "rgba(0,0,0,0.18)", borderColor: "rgba(255,255,255,0.10)" }}>
                      <TextInput
                        value={dndTo}
                        onChangeText={(v) => {
                          setDndTo(v);
                        }}
                        onBlur={() => {
                          void persistPrefs();
                        }}
                        className="h-11"
                        style={{ color: Colors.dark.textPrimary }}
                        placeholder="07:00"
                        placeholderTextColor={Colors.dark.textSecondary}
                      />
                    </View>
                  </View>
                </View>
              </View>
            </View>
          ) : null}

          <Separator />

          <Row
            title="Notification sound"
            value={notifySoundName}
            right={
              <View style={{ flexDirection: "row", gap: 6 }}>
                {(["default", "subtle", "silent"] as const).map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => {
                      setNotifySoundName(s);
                      void persistPrefs();
                    }}
                    style={({ pressed }) => ({
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: notifySoundName === s ? Colors.primaryBlue : Colors.dark.border,
                      backgroundColor: notifySoundName === s ? "rgba(88,101,242,0.16)" : pressed ? "rgba(255,255,255,0.08)" : Colors.dark.surface2,
                    })}
                  >
                    <Text style={{ color: notifySoundName === s ? Colors.primaryBlue : Colors.dark.textSecondary, fontWeight: "900" }}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            }
          />

          <Separator />

          <PremiumButton
            title="Test notification"
            variant="secondary"
            disabled={prefsBusy}
            onPress={() => {
              setPrefsError(null);
              ensureNotificationReady()
                .then((ok) => {
                  if (!ok) {
                    setPrefsError("Notification permission denied.");
                    return;
                  }

                  return Notifications.scheduleNotificationAsync({
                    content: {
                      title: "Cipher",
                      body: "This is a test notification.",
                      sound: "default",
                    },
                    trigger: null,
                  });
                })
                .catch((e: any) => {
                  setPrefsError(typeof e?.message === "string" ? e.message : "Failed to schedule notification");
                });
            }}
          />
        </Section>

        <Section title="Privacy & Security">
          <Row
            title="Two-factor authentication"
            value={twoFaEnabled ? "On" : "Off"}
            onPress={() => setTwoFaModalOpen(true)}
            right={<Text style={{ color: Colors.primaryBlue, fontWeight: "900" }}>Open</Text>}
          />
          <Separator />
          <Row
            title="Active sessions"
            value={sessions.length > 0 ? `${sessions.length} session${sessions.length === 1 ? "" : "s"}` : "Manage devices"}
            onPress={() => setSessionsModalOpen(true)}
            right={<Text style={{ color: Colors.primaryBlue, fontWeight: "900" }}>Open</Text>}
          />
          <Separator />
          <Row
            title="Privacy policy"
            value="Open link"
            onPress={() => {
              void openUrl("https://example.com/privacy");
            }}
            right={<Text style={{ color: Colors.primaryBlue, fontWeight: "900" }}>Open</Text>}
          />
          <Separator />
          <Row
            title="Terms of service"
            value="Open link"
            onPress={() => {
              void openUrl("https://example.com/terms");
            }}
            right={<Text style={{ color: Colors.primaryBlue, fontWeight: "900" }}>Open</Text>}
          />
          <Separator />
          <Row title="Data usage" value="Varies by usage" />
        </Section>

        <Section title="Storage & Cache">
          {storageError ? <Text style={{ color: Colors.dark.textSecondary, marginBottom: 8 }}>{storageError}</Text> : null}
          <Row title="Storage usage" value={storageBusy ? "Loading..." : formatBytes(storageUsageBytes)} />
          <Separator />
          <Row title="Cache size" value={storageBusy ? "Loading..." : formatBytes(cacheBytes)} />
          <Separator />
          <Row title="Downloaded files size" value={storageBusy ? "Loading..." : formatBytes(downloadsBytes)} />
          <Separator />
          <Row
            title="Clear cache"
            value={storageBusy ? "Working..." : "Tap to clear"}
            disabled={storageBusy}
            onPress={() => {
              if (storageBusy) return;
              const cacheDir = FileSystem.cacheDirectory ?? "";
              if (!cacheDir) return;
              setStorageError(null);
              setStorageBusy(true);
              FileSystem.deleteAsync(cacheDir, { idempotent: true })
                .then(() => FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true }).catch(() => {}))
                .then(() => refreshStorageStats())
                .catch((e: any) => {
                  setStorageError(typeof e?.message === "string" ? e.message : "Failed to clear cache");
                })
                .finally(() => setStorageBusy(false));
            }}
            right={<Text style={{ color: Colors.primaryBlue, fontWeight: "900" }}>Clear</Text>}
          />
          <Separator />
          <Row
            title="Clear downloaded files"
            value={storageBusy ? "Working..." : "Tap to clear"}
            disabled={storageBusy || !downloadsDir}
            onPress={() => {
              if (storageBusy) return;
              if (!downloadsDir) return;
              setStorageError(null);
              setStorageBusy(true);
              FileSystem.deleteAsync(downloadsDir, { idempotent: true })
                .then(() => FileSystem.makeDirectoryAsync(downloadsDir, { intermediates: true }).catch(() => {}))
                .then(() => refreshStorageStats())
                .catch((e: any) => {
                  setStorageError(typeof e?.message === "string" ? e.message : "Failed to clear downloads");
                })
                .finally(() => setStorageBusy(false));
            }}
            right={<Text style={{ color: Colors.primaryBlue, fontWeight: "900" }}>Clear</Text>}
          />
          <Separator />
          <Row
            title="Auto-delete old messages"
            value={storageAutoDelete ? "On" : "Off"}
            right={<Switch value={storageAutoDelete} onValueChange={(v) => { setStorageAutoDelete(v); void persistPrefs(); }} />}
          />
          <Separator />
          <Row
            title="Media auto-download"
            value={storageAutoDownload}
            right={
              <View style={{ flexDirection: "row", gap: 6 }}>
                {(["never", "wifi", "always"] as const).map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => {
                      setStorageAutoDownload(m);
                      void persistPrefs();
                    }}
                    style={({ pressed }) => ({
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: storageAutoDownload === m ? Colors.primaryBlue : Colors.dark.border,
                      backgroundColor: storageAutoDownload === m ? "rgba(88,101,242,0.16)" : pressed ? "rgba(255,255,255,0.08)" : Colors.dark.surface2,
                    })}
                  >
                    <Text style={{ color: storageAutoDownload === m ? Colors.primaryBlue : Colors.dark.textSecondary, fontWeight: "900" }}>{m}</Text>
                  </Pressable>
                ))}
              </View>
            }
          />
        </Section>

        <Section title="Developer / Advanced">
          <Row
            title="Enable debug logs"
            value={debugLogs ? "On" : "Off"}
            right={<Switch value={debugLogs} onValueChange={(v) => { setDebugLogs(v); void persistPrefs(); }} />}
          />
          <Separator />
          <Row
            title="Export app logs"
            value="Coming soon"
            disabled
          />
          <Separator />
          <Row
            title="API documentation"
            value="Open link"
            onPress={() => {
              void openUrl("https://example.com/docs");
            }}
            right={<Text style={{ color: Colors.primaryBlue, fontWeight: "900" }}>Open</Text>}
          />
        </Section>

        <Section title="About">
          <Row title="App name" value={Application.applicationName ?? "Cipher"} />
          <Separator />
          <Row title="App version" value={appVersion || "—"} />
          <Separator />
          <Row title="Build number" value={buildNumber || "—"} />
          <Separator />
          <Row
            title="Release notes"
            value="Open link"
            onPress={() => {
              void openUrl("https://example.com/release-notes");
            }}
            right={<Text style={{ color: Colors.primaryBlue, fontWeight: "900" }}>Open</Text>}
          />
          <Separator />
          <Row
            title="Check for updates"
            value="Coming soon"
            disabled
          />
          <Separator />
          <Row
            title="Company website"
            value="Open link"
            onPress={() => {
              void openUrl("https://example.com");
            }}
            right={<Text style={{ color: Colors.primaryBlue, fontWeight: "900" }}>Open</Text>}
          />
          <Separator />
          <Row
            title="Contact us"
            value="support@example.com"
            onPress={() => {
              void copy("support@example.com");
            }}
            right={<Text style={{ color: Colors.primaryBlue, fontWeight: "900" }}>Copy</Text>}
          />
          <Separator />
          <Row
            title="Report a bug"
            value="Open link"
            onPress={() => {
              void openUrl("https://example.com/bugs");
            }}
            right={<Text style={{ color: Colors.primaryBlue, fontWeight: "900" }}>Open</Text>}
          />
          <Separator />
          <Row
            title="Feature request"
            value="Open link"
            onPress={() => {
              void openUrl("https://example.com/feature-request");
            }}
            right={<Text style={{ color: Colors.primaryBlue, fontWeight: "900" }}>Open</Text>}
          />
          <Separator />
          <Row
            title="Rate app"
            value={Platform.OS === "android" ? "Open Play Store" : "Coming soon"}
            disabled={Platform.OS !== "android"}
            onPress={() => {
              if (Platform.OS !== "android") return;
              const appId = Application.applicationId;
              if (!appId) return;
              void Linking.openURL(`market://details?id=${appId}`).catch(() => {
                void Linking.openURL(`https://play.google.com/store/apps/details?id=${appId}`);
              });
            }}
            right={<Text style={{ color: Platform.OS === "android" ? Colors.primaryBlue : Colors.dark.textSecondary, fontWeight: "900" }}>Open</Text>}
          />
        </Section>

        <Section title="Danger Zone">
          <View style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
            <Text style={{ color: "rgba(255,255,255,0.65)", fontWeight: "900", fontSize: 12, marginBottom: 10, letterSpacing: 0.3 }}>
              DESTRUCTIVE ACTIONS
            </Text>
            <Text style={{ color: Colors.dark.textSecondary, lineHeight: 20, marginBottom: 12 }}>
              These actions affect your session and account. Proceed carefully.
            </Text>
            <View style={{ gap: 10 }}>
              <PremiumButton
                title={isBusy ? "Logging out..." : "Logout"}
                onPress={() => {
                  if (!isBusy) setLogoutConfirmOpen(true);
                }}
                disabled={isBusy}
                variant="danger"
              />
              <PremiumButton
                title="Delete account"
                variant="danger"
                onPress={() => {
                  setDeleteConfirmChecked(false);
                  setDeleteConfirmOpen(true);
                }}
              />
            </View>
          </View>
        </Section>
      </ScrollView>
    </PremiumScreen>
  );
}

import { Platform } from "react-native";
import api from "./api";
import { getToken } from "./auth";
import * as FileSystem from "expo-file-system";

export type UploadedFileDto = {
  id: string;
  url: string;
  type: "image" | "document" | "video" | "audio";
  name: string;
  size: number;
};

type UploadInput = {
  uri: string;
  name: string;
  mimeType?: string;
  kind: UploadedFileDto["type"];
};

export async function uploadFile(input: UploadInput): Promise<UploadedFileDto> {
  const form = new FormData();
  form.append("type", input.kind);

  if (Platform.OS === "web") {
    const resp = await fetch(input.uri);
    const blob = await resp.blob();
    (form as any).append("file", blob, input.name);
  } else {
    const token = await getToken();
    if (!token) {
      throw new Error("Not authenticated");
    }

    const baseURL = (process.env.EXPO_PUBLIC_API_URL?.trim() || process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || "").replace(/\/+$/, "");
    if (!baseURL) {
      throw new Error("Missing API base URL");
    }

    const url = `${baseURL.replace(/\/+$/, "")}/api/files/upload`;

    let uri = input.uri;
    if (!uri.startsWith("file://") && !uri.startsWith("content://")) {
      uri = `file://${uri}`;
    }

    if (uri.startsWith("content://") && FileSystem.cacheDirectory) {
      const safeName = input.name || `upload_${Date.now()}`;
      const dest = `${FileSystem.cacheDirectory}${Date.now()}_${safeName}`;
      try {
        await FileSystem.copyAsync({ from: uri, to: dest });
        uri = dest;
      } catch {
        // keep original uri if copy fails
      }
    }

    const res = await FileSystem.uploadAsync(url, uri, {
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: "file",
      parameters: {
        type: input.kind,
      },
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      mimeType: input.mimeType || "application/octet-stream",
    });

    const data = (() => {
      try {
        return JSON.parse(res.body);
      } catch {
        return null;
      }
    })();

    const file = (data as any)?.file as UploadedFileDto | undefined;
    if (!file?.url) {
      throw new Error("Invalid upload response");
    }
    return file;
  }

  const res = await api.post("/api/files/upload", form, { timeout: 60000 });

  const file = (res.data as any)?.file as UploadedFileDto | undefined;
  if (!file?.url) {
    throw new Error("Invalid upload response");
  }
  return file;
}

import api from "./api";

export type StreamChatUserTokenResponse = {
  apiKey: string;
  token: string;
  userId: string;
};

export type StreamChatBackfillResponse = {
  ok: boolean;
  workspaces: number;
  channels: number;
  dms: number;
};

export async function getStreamChatUserToken(): Promise<StreamChatUserTokenResponse> {
  const res = await api.get("/api/stream/chat/token");
  const data = res.data as any;

  return {
    apiKey: typeof data?.apiKey === "string" ? data.apiKey : "",
    token: typeof data?.token === "string" ? data.token : "",
    userId: typeof data?.userId === "string" ? data.userId : "",
  };
}

export async function backfillStreamChat(): Promise<StreamChatBackfillResponse> {
  const res = await api.post("/api/stream/chat/backfill");
  return res.data as any;
}

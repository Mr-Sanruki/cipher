import api from "./api";

export type StreamVideoUserTokenResponse = {
  apiKey: string;
  token: string;
  userId: string;
};

export async function getStreamVideoUserToken(): Promise<StreamVideoUserTokenResponse> {
  const res = await api.get("/api/stream/video/token");
  const data = res.data as any;

  return {
    apiKey: typeof data?.apiKey === "string" ? data.apiKey : "",
    token: typeof data?.token === "string" ? data.token : "",
    userId: typeof data?.userId === "string" ? data.userId : "",
  };
}

export type CreateStreamVideoCallTokenInput = {
  callCids: string[];
  role?: string;
  validitySeconds?: number;
};

export type StreamVideoCallTokenResponse = {
  apiKey: string;
  token: string;
};

export async function createStreamVideoCallToken(input: CreateStreamVideoCallTokenInput): Promise<StreamVideoCallTokenResponse> {
  const res = await api.post("/api/stream/video/call-token", input);
  const data = res.data as any;

  return {
    apiKey: typeof data?.apiKey === "string" ? data.apiKey : "",
    token: typeof data?.token === "string" ? data.token : "",
  };
}

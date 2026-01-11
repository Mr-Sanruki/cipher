import api from "./api";
import { getToken } from "./auth";

export type AiProvider = "openai" | "grok";

export type AiChatRole = "system" | "user" | "assistant";

export type AiChatMessage = {
  role: AiChatRole;
  content: string;
};

export type AiChatRequest = {
  provider?: AiProvider;
  model?: string;
  messages: AiChatMessage[];
  temperature?: number;
  maxTokens?: number;
};

export type AiChatResponse = {
  provider: AiProvider;
  model: string;
  message: AiChatMessage;
  usage: unknown | null;
};

export async function aiChat(input: AiChatRequest): Promise<AiChatResponse> {
  const res = await api.post("/api/ai/chat", input);
  const data = res.data as any;

  const provider = (data?.provider as AiProvider | undefined) ?? (input.provider ?? "openai");
  const model = typeof data?.model === "string" ? data.model : input.model ?? "";
  const message = data?.message as AiChatMessage | undefined;

  if (!message || typeof message?.role !== "string" || typeof message?.content !== "string") {
    throw new Error("Invalid AI chat response");
  }

  return {
    provider,
    model,
    message,
    usage: data?.usage ?? null,
  };
}

export type AiStreamEvent =
  | { type: "meta"; provider: AiProvider; model: string }
  | { type: "delta"; delta: string }
  | { type: "done" }
  | { type: "error"; message: string };

function resolveBaseUrl(): string {
  const baseURL = process.env.EXPO_PUBLIC_API_URL?.trim() || process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (!baseURL) {
    throw new Error("Missing EXPO_PUBLIC_API_URL (or EXPO_PUBLIC_API_BASE_URL)");
  }

  return baseURL.replace(/\/+$/, "");
}

function toAbsoluteUrl(pathname: string): string {
  const base = resolveBaseUrl();
  const p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${base}${p}`;
}

function parseSseEvents(chunk: string): { events: AiStreamEvent[]; rest: string } {
  const events: AiStreamEvent[] = [];

  let buffer = chunk;
  while (true) {
    const idx = buffer.indexOf("\n\n");
    if (idx === -1) break;

    const raw = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 2);

    const lines = raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice("data:".length).trim();
      if (!data) continue;

      try {
        const parsed = JSON.parse(data) as AiStreamEvent;
        if (parsed && typeof (parsed as any).type === "string") {
          events.push(parsed);
        }
      } catch {
        continue;
      }
    }
  }

  return { events, rest: buffer };
}

export async function aiChatStream(input: {
  request: AiChatRequest;
  onEvent: (event: AiStreamEvent) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const token = await getToken();
  if (!token) {
    throw new Error("Not authenticated");
  }

  const url = toAbsoluteUrl("/api/ai/chat/stream");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input.request),
    signal: input.signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `AI stream request failed (${response.status})`);
  }

  const body: any = response.body as any;
  const reader: ReadableStreamDefaultReader<Uint8Array> | null = body?.getReader ? body.getReader() : null;

  if (!reader) {
    const text = await response.text().catch(() => "");
    const parsed = parseSseEvents(text);

    if (parsed.events.length > 0) {
      let sawDone = false;
      for (const event of parsed.events) {
        input.onEvent(event);
        if (event.type === "done") {
          sawDone = true;
        }
      }
      if (!sawDone) {
        input.onEvent({ type: "done" });
      }
      return;
    }

    const fallback = await aiChat(input.request);
    input.onEvent({ type: "meta", provider: fallback.provider, model: fallback.model });
    if (fallback.message.content) {
      input.onEvent({ type: "delta", delta: fallback.message.content });
    }
    input.onEvent({ type: "done" });
    return;
  }

  const decoder = new TextDecoder();
  let buffered = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffered += decoder.decode(value, { stream: true });

    const parsed = parseSseEvents(buffered);
    buffered = parsed.rest;

    for (const event of parsed.events) {
      input.onEvent(event);
      if (event.type === "done") {
        try {
          await reader.cancel();
        } catch {
          return;
        }
        return;
      }
    }
  }

  const tail = parseSseEvents(buffered);
  for (const event of tail.events) {
    input.onEvent(event);
  }
}

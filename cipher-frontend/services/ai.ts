import api from "./api";
import { getToken } from "./auth";

export type AiProvider = "groq" | "openai" | "grok";

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
  workspaceId?: string;
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

// ========== AI AUTOMATION FEATURES ==========

export type AutomationTask = {
  id: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  dueDate?: string;
  category: string;
  completed: boolean;
};

export type SmartSuggestion = {
  id: string;
  type: "task" | "habit" | "calendar" | "message" | "call";
  title: string;
  description: string;
  action: string;
  confidence: number;
};

export type AiContext = {
  recentMessages: { sender: string; content: string; timestamp: string }[];
  currentTasks: AutomationTask[];
  userHabits: { name: string; streak: number; lastCompleted: string }[];
  calendarEvents: { title: string; startTime: string; endTime: string }[];
  userPreferences: Record<string, string>;
};

/**
 * AI Automation: Analyze user patterns and suggest actions
 */
export async function analyzeUserPatterns(context: AiContext): Promise<SmartSuggestion[]> {
  const prompt = `
You are an intelligent AI assistant like Grok. Analyze the user's current context and suggest smart actions.

User Context:
- Recent Messages: ${JSON.stringify(context.recentMessages)}
- Current Tasks: ${JSON.stringify(context.currentTasks)}
- User Habits: ${JSON.stringify(context.userHabits)}
- Calendar Events: ${JSON.stringify(context.calendarEvents)}

Based on this context, suggest 3-5 smart actions the user might want to take.
Respond ONLY with a JSON array of suggestions in this format:
[
  {
    "id": "unique-id",
    "type": "task|habit|calendar|message|call",
    "title": "Brief action title",
    "description": "Detailed description",
    "action": "Specific action to take",
    "confidence": 0.95
  }
]
`;

  try {
    const response = await aiChat({
      provider: "groq",
      messages: [
        { role: "system", content: "You are a helpful AI assistant focused on productivity and automation." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
    });

    const content = response.message.content;
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return [];
  } catch (error) {
    console.error("Failed to analyze user patterns:", error);
    return [];
  }
}

/**
 * AI Automation: Auto-schedule tasks based on priority and calendar
 */
export async function autoScheduleTasks(tasks: AutomationTask[], calendarEvents: { startTime: string; endTime: string }[]): Promise<AutomationTask[]> {
  const prompt = `
You are an intelligent scheduling assistant. Optimize the schedule for these tasks:

Tasks:
${JSON.stringify(tasks)}

Existing Calendar Events:
${JSON.stringify(calendarEvents)}

Suggest the best time slots for each task. Return ONLY a JSON array with updated dueDate fields:
[
  { "id": "task-id", "suggestedDueDate": "ISO timestamp", "reasoning": "brief explanation" }
]
`;

  try {
    const response = await aiChat({
      provider: "groq",
      messages: [
        { role: "system", content: "You are an expert scheduling assistant." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
    });

    const content = response.message.content;
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const schedule = JSON.parse(jsonMatch[0]);
      return tasks.map(task => {
        const suggestion = schedule.find((s: any) => s.id === task.id);
        if (suggestion?.suggestedDueDate) {
          return { ...task, dueDate: suggestion.suggestedDueDate };
        }
        return task;
      });
    }
    return tasks;
  } catch (error) {
    console.error("Failed to auto-schedule tasks:", error);
    return tasks;
  }
}

/**
 * AI Automation: Smart message summarization and action extraction
 */
export async function summarizeAndExtractActions(messages: { sender: string; content: string }[]): Promise<{
  summary: string;
  actionItems: string[];
  priority: "high" | "medium" | "low";
}> {
  const prompt = `
Summarize these messages and extract action items:

Messages:
${messages.map(m => `${m.sender}: ${m.content}`).join("\n")}

Respond with JSON:
{
  "summary": "Brief summary of the conversation",
  "actionItems": ["action 1", "action 2"],
  "priority": "high|medium|low"
}
`;

  try {
    const response = await aiChat({
      provider: "groq",
      messages: [
        { role: "system", content: "You are a business assistant that extracts key information from conversations." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
    });

    const content = response.message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { summary: "", actionItems: [], priority: "low" };
  } catch (error) {
    console.error("Failed to summarize messages:", error);
    return { summary: "", actionItems: [], priority: "low" };
  }
}

/**
 * AI Automation: Generate habit recommendations based on user behavior
 */
export async function generateHabitRecommendations(
  existingHabits: { name: string; streak: number }[],
  userGoals: string[]
): Promise<{ name: string; description: string; frequency: string; reason: string }[]> {
  const prompt = `
Based on the user's existing habits and goals, suggest 3 new habits to build:

Existing Habits:
${JSON.stringify(existingHabits)}

User Goals:
${JSON.stringify(userGoals)}

Suggest new habits in JSON format:
[
  {
    "name": "Habit name",
    "description": "Detailed description",
    "frequency": "daily|weekly",
    "reason": "Why this habit helps achieve goals"
  }
]
`;

  try {
    const response = await aiChat({
      provider: "groq",
      messages: [
        { role: "system", content: "You are a habit-building expert and productivity coach." },
        { role: "user", content: prompt },
      ],
      temperature: 0.5,
    });

    const content = response.message.content;
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return [];
  } catch (error) {
    console.error("Failed to generate habit recommendations:", error);
    return [];
  }
}

/**
 * AI Automation: Smart reply suggestions for messages
 */
export async function generateSmartReplies(
  messageHistory: { role: "user" | "assistant"; content: string }[],
  currentMessage: string,
  tone: "professional" | "casual" | "friendly" = "professional"
): Promise<string[]> {
  const prompt = `
Given the conversation history and the current message, suggest 3 quick reply options.

Conversation History:
${messageHistory.slice(-5).map(m => `${m.role}: ${m.content}`).join("\n")}

Current Message: ${currentMessage}

Tone: ${tone}

Respond with JSON array of reply strings (max 100 chars each):
["Reply option 1", "Reply option 2", "Reply option 3"]
`;

  try {
    const response = await aiChat({
      provider: "groq",
      messages: [
        { role: "system", content: "You are a communication assistant that helps craft quick, contextually appropriate replies." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      maxTokens: 200,
    });

    const content = response.message.content;
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return [];
  } catch (error) {
    console.error("Failed to generate smart replies:", error);
    return [];
  }
}

/**
 * AI Automation: Voice command processing
 */
export async function processVoiceCommand(transcript: string): Promise<{
  intent: string;
  action: string;
  params: Record<string, any>;
  response: string;
}> {
  const prompt = `
Process this voice command and extract intent:

"${transcript}"

Respond with JSON:
{
  "intent": "create_task|send_message|schedule_call|set_reminder|search|other",
  "action": "specific action to take",
  "params": { "key": "value" },
  "response": "natural language response to user"
}

Examples:
- "Remind me to call John at 5pm" → intent: "set_reminder", params: { "title": "Call John", "time": "17:00" }
- "Schedule a meeting with the team tomorrow" → intent: "schedule_call", params: { "title": "Team meeting", "date": "tomorrow" }
- "Create a task to finish the report" → intent: "create_task", params: { "title": "Finish the report" }
`;

  try {
    const response = await aiChat({
      provider: "groq",
      messages: [
        { role: "system", content: "You are a voice command processor for a productivity app." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    });

    const content = response.message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { intent: "other", action: "none", params: {}, response: "I'm not sure what you'd like me to do." };
  } catch (error) {
    console.error("Failed to process voice command:", error);
    return { intent: "other", action: "none", params: {}, response: "Sorry, I didn't understand that." };
  }
}

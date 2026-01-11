import type { Response, NextFunction } from "express";
import { z } from "zod";
import OpenAI from "openai";
import type { AuthenticatedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { env } from "../config/env";

type Provider = "openai" | "grok";

type ChatRole = "system" | "user" | "assistant";

type AiChatMessage = {
  role: ChatRole;
  content: string;
};

const aiChatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

export const aiChatBodySchema = z.object({
  provider: z.enum(["openai", "grok"]).optional().default("openai"),
  model: z.string().optional(),
  messages: z.array(aiChatMessageSchema).min(1),
  temperature: z.coerce.number().min(0).max(2).optional(),
  maxTokens: z.coerce.number().int().positive().optional(),
});

type AiChatBody = z.infer<typeof aiChatBodySchema>;

function resolveClient(provider: Provider): { client: OpenAI; defaultModel: string } {
  if (provider === "grok") {
    const apiKey = env.GROK_API_KEY.trim();
    if (!apiKey) {
      throw new HttpError(400, "GROK_API_KEY is not configured");
    }

    const baseURL = env.GROK_BASE_URL.trim() || "https://api.x.ai/v1";

    return {
      client: new OpenAI({ apiKey, baseURL }),
      defaultModel: "grok-2-latest",
    };
  }

  const apiKey = env.OPENAI_API_KEY.trim();
  if (!apiKey) {
    throw new HttpError(400, "OPENAI_API_KEY is not configured");
  }

  return {
    client: new OpenAI({ apiKey }),
    defaultModel: "gpt-4o-mini",
  };
}

function resolveModel(body: AiChatBody, defaultModel: string): string {
  const trimmed = (body.model ?? "").trim();
  return trimmed ? trimmed : defaultModel;
}

function normalizeMessages(messages: AiChatMessage[]): { role: ChatRole; content: string }[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Request failed";
}

export async function chat(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = aiChatBodySchema.parse(req.body);
    const { client, defaultModel } = resolveClient(body.provider);
    const model = resolveModel(body, defaultModel);

    const completion = await client.chat.completions.create({
      model,
      messages: normalizeMessages(body.messages) as any,
      temperature: body.temperature,
      max_tokens: body.maxTokens,
    });

    const content = completion.choices[0]?.message?.content ?? "";

    res.json({
      provider: body.provider,
      model,
      message: { role: "assistant", content },
      usage: completion.usage ?? null,
    });
  } catch (error) {
    next(error);
  }
}

export async function chatStream(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = aiChatBodySchema.parse(req.body);
    const { client, defaultModel } = resolveClient(body.provider);
    const model = resolveModel(body, defaultModel);

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const abortController = new AbortController();
    const onClose = () => abortController.abort();
    req.on("close", onClose);

    try {
      const stream = await client.chat.completions.create(
        {
          model,
          messages: normalizeMessages(body.messages) as any,
          temperature: body.temperature,
          max_tokens: body.maxTokens,
          stream: true,
        },
        { signal: abortController.signal }
      );

      res.write(`data: ${JSON.stringify({ type: "meta", provider: body.provider, model })}\n\n`);

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          res.write(`data: ${JSON.stringify({ type: "delta", delta })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    } catch (error) {
      if (!abortController.signal.aborted && !res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: "error", message: errorMessage(error) })}\n\n`);
      }
    } finally {
      req.off("close", onClose);
      res.end();
    }
  } catch (error) {
    next(error);
  }
}

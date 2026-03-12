import { logger } from "../utils/logger";

type ExpoPushMessage = {
  to: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  priority?: "default" | "normal" | "high";
  channelId?: string;
};

type ExpoPushResponse = {
  data?: unknown;
  errors?: unknown;
};

type ExpoTicket = {
  status?: "ok" | "error";
  id?: string;
  message?: string;
  details?: unknown;
};

function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export async function sendExpoPush(
  tokens: string[],
  message: Omit<ExpoPushMessage, "to">,
): Promise<void> {
  const uniqueTokens = Array.from(
    new Set(tokens.map((t) => String(t ?? "").trim()).filter(Boolean)),
  );
  if (uniqueTokens.length === 0) return;

  const batches = chunk(uniqueTokens, 90);

  for (const batch of batches) {
    const payload: ExpoPushMessage[] = batch.map((to) => ({
      to,
      title: message.title,
      body: message.body,
      data: message.data,
      sound: message.sound ?? "default",
      priority: message.priority ?? "high",
      channelId: message.channelId ?? "default",
    }));

    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const json = (await res.json().catch(() => null)) as ExpoPushResponse | null;

      if (!res.ok) {
        logger.warn("Expo push request failed", {
          status: res.status,
          body: json,
        });
        continue;
      }

      if (json?.errors) {
        logger.warn("Expo push responded with errors", { errors: json.errors });
      }

      const tickets = Array.isArray((json as any)?.data) ? (((json as any).data as unknown[]) ?? []) : [];
      for (let i = 0; i < tickets.length; i += 1) {
        const t = tickets[i] as ExpoTicket;
        if (String(t?.status ?? "") === "error") {
          logger.warn("Expo push ticket error", {
            token: batch[i],
            message: t?.message,
            details: t?.details,
          });
        }
      }
    } catch (error) {
      logger.warn("Expo push request error", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

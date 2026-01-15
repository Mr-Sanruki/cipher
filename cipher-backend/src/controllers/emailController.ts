import type { Response, NextFunction } from "express";
import { z } from "zod";
import type { AuthenticatedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { requireWorkspaceMember } from "../utils/access";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import nodemailer from "nodemailer";

export const sendEmailBodySchema = z.object({
  workspaceId: z.string().min(1),
  to: z.array(z.string().email()).min(1).max(50),
  subject: z.string().min(1).max(200),
  text: z.string().min(1).max(20000),
});

type SendEmailBody = z.infer<typeof sendEmailBodySchema>;

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;

  const secure = env.SMTP_PORT === 465;

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure,
    auth: env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });

  return transporter;
}

function parseFrom(raw: string): { name: string; email: string } {
  const trimmed = String(raw ?? "").trim();
  const match = trimmed.match(/^(.*)<([^>]+)>$/);
  if (match) {
    const name = match[1].trim().replace(/^"|"$/g, "");
    const email = match[2].trim();
    return { name, email };
  }
  return { name: "", email: trimmed };
}

async function safeReadBody(response: globalThis.Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

export async function sendEmail(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const body: SendEmailBody = sendEmailBodySchema.parse(req.body);

    await requireWorkspaceMember({ userId: req.userId, workspaceId: body.workspaceId });

    if (env.EMAIL_PROVIDER === "console") {
      logger.info("Email send (console)", {
        workspaceId: body.workspaceId,
        fromUserId: req.userId,
        to: body.to,
        subject: body.subject,
        textPreview: body.text.slice(0, 500),
      });
      res.json({ message: "Email logged (console provider)", delivered: false });
      return;
    }

    if (!env.SMTP_FROM) {
      throw new HttpError(400, "SMTP_FROM is not configured");
    }

    if (env.EMAIL_PROVIDER === "brevo") {
      const from = parseFrom(env.SMTP_FROM);
      try {
        const url = `${env.BREVO_BASE_URL.replace(/\/+$/, "")}/v3/smtp/email`;
        const response = await fetch(url, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "api-key": env.BREVO_API_KEY,
          },
          body: JSON.stringify({
            sender: from.name ? { name: from.name, email: from.email } : { email: from.email },
            to: body.to.map((email) => ({ email })),
            subject: body.subject,
            textContent: body.text,
          }),
        });

        if (!response.ok) {
          const respBody = await safeReadBody(response);
          throw new Error(
            `Brevo API error: ${response.status} ${response.statusText}${respBody ? ` - ${respBody}` : ""}`,
          );
        }

        res.json({ message: "Email sent", delivered: true });
        return;
      } catch (e) {
        logger.error("Email send failed (brevo)", {
          workspaceId: body.workspaceId,
          fromUserId: req.userId,
          error: e instanceof Error ? e.message : String(e),
        });
        throw new HttpError(502, "Email provider error");
      }
    }

    const tx = getTransporter();

    await tx.sendMail({
      from: env.SMTP_FROM,
      to: body.to,
      subject: body.subject,
      text: body.text,
    });

    res.json({ message: "Email sent", delivered: true });
  } catch (error) {
    next(error);
  }
}

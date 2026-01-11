import nodemailer from "nodemailer";
import { env } from "../config/env";
import { logger } from "../utils/logger";

export type SendOtpEmailInput = {
  to: string;
  otp: string;
  expiresInMinutes: number;
};

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

async function safeReadBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

export async function sendOtpEmail(input: SendOtpEmailInput): Promise<void> {
  if (env.EMAIL_PROVIDER === "console") {
    logger.info("OTP issued", { to: input.to, otp: input.otp, expiresInMinutes: input.expiresInMinutes });
    return;
  }

  if (env.EMAIL_PROVIDER === "brevo") {
    const subject = "Your Cipher verification code";
    const text = `Your Cipher OTP is ${input.otp}. It expires in ${input.expiresInMinutes} minutes.`;

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
          to: [{ email: input.to }],
          subject,
          textContent: text,
        }),
      });

      if (!response.ok) {
        const body = await safeReadBody(response);
        throw new Error(`Brevo API error: ${response.status} ${response.statusText}${body ? ` - ${body}` : ""}`);
      }

      logger.info("OTP email sent", { to: input.to, provider: "brevo" });
      return;
    } catch (error) {
      logger.error("Failed to send OTP email", { to: input.to, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  const tx = getTransporter();

  const subject = "Your Cipher verification code";
  const text = `Your Cipher OTP is ${input.otp}. It expires in ${input.expiresInMinutes} minutes.`;

  try {
    await tx.sendMail({
      from: env.SMTP_FROM,
      to: input.to,
      subject,
      text,
    });

    logger.info("OTP email sent", { to: input.to });
  } catch (error) {
    logger.error("Failed to send OTP email", { to: input.to, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

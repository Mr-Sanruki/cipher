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

export async function sendOtpEmail(input: SendOtpEmailInput): Promise<void> {
  if (env.EMAIL_PROVIDER === "console") {
    logger.info("OTP issued", { to: input.to, otp: input.otp, expiresInMinutes: input.expiresInMinutes });
    return;
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

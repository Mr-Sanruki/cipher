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

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: false,
    auth: env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });

  return transporter;
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

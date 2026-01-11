import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { EmailOtp } from "../models/EmailOtp";
import { User } from "../models/User";
import { type UserSessionDoc, UserSession } from "../models/UserSession";
import { sendOtpEmail } from "../services/emailService";
import { HttpError } from "../middleware/errorHandler";
import { generateOtpCode } from "../utils/generators";
import { signAccessToken, verifyAccessToken } from "../utils/jwt";

const emailSchema = z.string().email().transform((v) => v.toLowerCase().trim());

const OTP_EXPIRES_IN_MINUTES = 10;

export const signupBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(128),
  name: z.string().min(2).max(60),
});

export const requestOtpBodySchema = z.object({
  email: emailSchema,
});

export const verifyOtpBodySchema = z.object({
  email: emailSchema,
  otp: z.string().regex(/^\d{6}$/),
});

export const loginBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(128),
});

export async function signup(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password, name } = signupBodySchema.parse(req.body);

    const existing = await User.findOne({ email }).lean();
    if (existing) {
      throw new HttpError(409, "Email already registered");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await User.create({
      email,
      passwordHash,
      name,
      avatarUrl: "",
      status: "online",
      isEmailVerified: false,
    });

    const { otp, expiresInSeconds } = await issueOtp(email);

    const payload: Record<string, unknown> = {
      message: "Signup successful. OTP sent.",
      email,
      expiresIn: expiresInSeconds,
    };

    if (env.NODE_ENV !== "production" && env.EMAIL_PROVIDER === "console") {
      payload.devOtp = otp;
    }

    res.status(201).json(payload);
  } catch (error) {
    next(error);
  }
}

export async function requestOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email } = requestOtpBodySchema.parse(req.body);

    const user = await User.findOne({ email }).lean();
    if (!user) {
      throw new HttpError(404, "Account not found");
    }

    const { otp, expiresInSeconds } = await issueOtp(email);

    const payload: Record<string, unknown> = { message: "OTP sent", expiresIn: expiresInSeconds };

    if (env.NODE_ENV !== "production" && env.EMAIL_PROVIDER === "console") {
      payload.devOtp = otp;
    }

    res.json(payload);
  } catch (error) {
    next(error);
  }
}

export async function verifyOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, otp } = verifyOtpBodySchema.parse(req.body);

    const otpDoc = await EmailOtp.findOne({ email }).sort({ createdAt: -1 });
    if (!otpDoc) {
      throw new HttpError(400, "OTP not found or expired");
    }

    if (otpDoc.expiresAt.getTime() < Date.now()) {
      await EmailOtp.deleteMany({ email });
      throw new HttpError(400, "OTP expired");
    }

    const ok = await bcrypt.compare(otp, otpDoc.otpHash);
    if (!ok) {
      throw new HttpError(400, "Invalid OTP");
    }

    const user = await User.findOneAndUpdate({ email }, { $set: { isEmailVerified: true } }, { new: true });
    if (!user) {
      throw new HttpError(404, "Account not found");
    }

    await EmailOtp.deleteMany({ email });

    const session = await UserSession.create({
      userId: user._id,
      userAgent: String(req.headers["user-agent"] ?? ""),
      ip: String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? ""),
      lastUsedAt: new Date(),
    });

    const token = signAccessToken(String(user._id), String(session._id));

    res.json({ token, user: user.toJSON() });
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = loginBodySchema.parse(req.body);

    const user = await User.findOne({ email });
    if (!user) {
      throw new HttpError(401, "Invalid email or password");
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new HttpError(401, "Invalid email or password");
    }

    if (!user.isEmailVerified) {
      throw new HttpError(403, "Email not verified");
    }

    const session = await UserSession.create({
      userId: user._id,
      userAgent: String(req.headers["user-agent"] ?? ""),
      ip: String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? ""),
      lastUsedAt: new Date(),
    });

    const token = signAccessToken(String(user._id), String(session._id));

    res.json({ token, user: user.toJSON() });
  } catch (error) {
    next(error);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new HttpError(401, "Missing Authorization header");
    }

    const token = header.slice("Bearer ".length).trim();
    const payload = verifyAccessToken(token);

    const user = await User.findById(payload.sub).lean();
    if (!user) {
      throw new HttpError(401, "Invalid token");
    }

    const session = await UserSession.findOne({ _id: payload.sid, userId: payload.sub }).lean<UserSessionDoc>();
    if (!session || session.revokedAt) {
      throw new HttpError(401, "Session expired");
    }

    await UserSession.updateOne({ _id: payload.sid }, { $set: { lastUsedAt: new Date() } });

    const nextToken = signAccessToken(payload.sub, payload.sid);

    res.json({ token: nextToken });
  } catch (error) {
    next(error);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      const token = header.slice("Bearer ".length).trim();
      if (token) {
        try {
          const payload = verifyAccessToken(token);
          await UserSession.updateOne({ _id: payload.sid, userId: payload.sub }, { $set: { revokedAt: new Date() } }).lean();
        } catch {
          // ignore
        }
      }
    }
    res.json({ message: "Logged out" });
  } catch (error) {
    next(error);
  }
}

async function issueOtp(email: string): Promise<{ otp: string; expiresInSeconds: number }> {
  const otp = generateOtpCode();
  const otpHash = await bcrypt.hash(otp, 12);
  const expiresInMinutes = OTP_EXPIRES_IN_MINUTES;
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

  await EmailOtp.deleteMany({ email });
  await EmailOtp.create({ email, otpHash, expiresAt });

  await sendOtpEmail({ to: email, otp, expiresInMinutes });

  return { otp, expiresInSeconds: expiresInMinutes * 60 };
}

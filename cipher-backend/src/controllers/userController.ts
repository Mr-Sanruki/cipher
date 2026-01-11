import type { Response, NextFunction } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { env } from "../config/env";
import { EmailOtp } from "../models/EmailOtp";
import { User } from "../models/User";
import { UserSession } from "../models/UserSession";
import type { AuthenticatedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { sendOtpEmail } from "../services/emailService";
import { generateOtpCode } from "../utils/generators";
import { generateBackupCodes, generateTotpSecretBase32, totpCode, verifyTotp } from "../utils/totp";

export const updateProfileBodySchema = z.object({
  name: z.string().min(2).max(60).optional(),
  avatarUrl: z.string().max(2048).optional(),
  status: z.enum(["online", "offline", "away"]).optional(),
  customStatus: z.string().max(140).optional(),
  phone: z.string().max(32).optional(),
  bio: z.string().max(280).optional(),
  timezone: z.string().max(64).optional(),
  location: z.string().max(80).optional(),
});

export const changePasswordBodySchema = z.object({
  oldPassword: z.string().min(8).max(128),
  newPassword: z.string().min(8).max(128),
});

export const deleteAccountBodySchema = z.object({
  password: z.string().min(8).max(128),
});

const emailSchema = z.string().email().transform((v) => v.toLowerCase().trim());

export const requestEmailChangeBodySchema = z.object({
  newEmail: emailSchema,
  password: z.string().min(8).max(128),
});

export const verifyEmailChangeBodySchema = z.object({
  newEmail: emailSchema,
  otp: z.string().regex(/^\d{6}$/),
});

const EMAIL_CHANGE_OTP_EXPIRES_IN_MINUTES = 10;

export const revokeSessionBodySchema = z.object({
  sessionId: z.string().min(1),
});

export const twoFaVerifyBodySchema = z.object({
  code: z.string().min(1),
});

export const twoFaDisableBodySchema = z.object({
  code: z.string().min(1),
});

export async function getProfile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      throw new HttpError(404, "User not found");
    }

    res.json({ user: user.toJSON() });
  } catch (error) {
    next(error);
  }
}

export async function changePassword(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { oldPassword, newPassword } = changePasswordBodySchema.parse(req.body);

    const user = await User.findById(req.userId);
    if (!user) {
      throw new HttpError(404, "User not found");
    }

    const ok = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!ok) {
      throw new HttpError(401, "Invalid password");
    }

    if (oldPassword === newPassword) {
      throw new HttpError(400, "New password must be different");
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();

    res.json({ message: "Password updated" });
  } catch (error) {
    next(error);
  }
}

export async function deleteAccount(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { password } = deleteAccountBodySchema.parse(req.body);

    const user = await User.findById(req.userId);
    if (!user) {
      throw new HttpError(404, "User not found");
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new HttpError(401, "Invalid password");
    }

    await User.findByIdAndDelete(req.userId);

    res.json({ message: "Account deleted" });
  } catch (error) {
    next(error);
  }
}

export async function requestEmailChange(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { newEmail, password } = requestEmailChangeBodySchema.parse(req.body);

    const existing = await User.findOne({ email: newEmail }).lean();
    if (existing) {
      throw new HttpError(409, "Email already registered");
    }

    const user = await User.findById(req.userId);
    if (!user) {
      throw new HttpError(404, "User not found");
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new HttpError(401, "Invalid password");
    }

    const otp = generateOtpCode();
    const otpHash = await bcrypt.hash(otp, 12);
    const expiresAt = new Date(Date.now() + EMAIL_CHANGE_OTP_EXPIRES_IN_MINUTES * 60 * 1000);

    await EmailOtp.deleteMany({ email: newEmail });
    await EmailOtp.create({ email: newEmail, otpHash, expiresAt });

    await sendOtpEmail({ to: newEmail, otp, expiresInMinutes: EMAIL_CHANGE_OTP_EXPIRES_IN_MINUTES });

    const payload: Record<string, unknown> = {
      message: "OTP sent",
      email: newEmail,
      expiresIn: EMAIL_CHANGE_OTP_EXPIRES_IN_MINUTES * 60,
    };

    if (env.NODE_ENV !== "production" && env.EMAIL_PROVIDER === "console") {
      payload.devOtp = otp;
    }

    res.json(payload);
  } catch (error) {
    next(error);
  }
}

export async function verifyEmailChange(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { newEmail, otp } = verifyEmailChangeBodySchema.parse(req.body);

    const user = await User.findById(req.userId);
    if (!user) {
      throw new HttpError(404, "User not found");
    }

    const otpDoc = await EmailOtp.findOne({ email: newEmail }).sort({ createdAt: -1 });
    if (!otpDoc) {
      throw new HttpError(400, "OTP not found or expired");
    }

    if (otpDoc.expiresAt.getTime() < Date.now()) {
      await EmailOtp.deleteMany({ email: newEmail });
      throw new HttpError(400, "OTP expired");
    }

    const ok = await bcrypt.compare(otp, otpDoc.otpHash);
    if (!ok) {
      throw new HttpError(400, "Invalid OTP");
    }

    const existing = await User.findOne({ email: newEmail }).lean();
    if (existing) {
      throw new HttpError(409, "Email already registered");
    }

    user.email = newEmail;
    user.isEmailVerified = true;
    await user.save();

    await EmailOtp.deleteMany({ email: newEmail });

    res.json({ message: "Email updated", user: user.toJSON() });
  } catch (error) {
    next(error);
  }
}

export async function listSessions(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const sessions = await UserSession.find({ userId: req.userId })
      .sort({ lastUsedAt: -1, createdAt: -1 })
      .limit(50)
      .lean();

    const payload = sessions.map((s: any) => ({
      _id: String(s._id),
      userAgent: String(s.userAgent ?? ""),
      ip: String(s.ip ?? ""),
      lastUsedAt: s.lastUsedAt ? new Date(s.lastUsedAt).toISOString() : null,
      createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : null,
      revokedAt: s.revokedAt ? new Date(s.revokedAt).toISOString() : null,
      isCurrent: String(s._id) === String(req.sessionId),
    }));

    res.json({ sessions: payload });
  } catch (error) {
    next(error);
  }
}

export async function revokeSession(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sessionId } = revokeSessionBodySchema.parse(req.body);

    const session = await UserSession.findOne({ _id: sessionId, userId: req.userId });
    if (!session) {
      throw new HttpError(404, "Session not found");
    }

    if (session.revokedAt) {
      res.json({ message: "Session revoked" });
      return;
    }

    session.revokedAt = new Date();
    await session.save();

    res.json({ message: "Session revoked" });
  } catch (error) {
    next(error);
  }
}

export async function revokeAllOtherSessions(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await UserSession.updateMany(
      { userId: req.userId, _id: { $ne: req.sessionId }, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    ).lean();

    res.json({ message: "Other sessions revoked" });
  } catch (error) {
    next(error);
  }
}

export async function setupTwoFa(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      throw new HttpError(404, "User not found");
    }

    const secret = generateTotpSecretBase32();
    const backupCodes = generateBackupCodes(8);
    const backupHashes = await Promise.all(backupCodes.map((c) => bcrypt.hash(c, 12)));

    user.twoFaSecret = secret;
    user.twoFaEnabled = false;
    user.twoFaBackupCodeHashes = backupHashes;
    await user.save();

    const issuer = "Cipher";
    const label = encodeURIComponent(`${issuer}:${user.email}`);
    const issuerParam = encodeURIComponent(issuer);
    const otpauthUrl = `otpauth://totp/${label}?secret=${secret}&issuer=${issuerParam}&digits=6&period=30`;

    const payload: Record<string, unknown> = {
      secret,
      otpauthUrl,
      backupCodes,
      message: "2FA setup started. Verify code to enable.",
    };

    if (env.NODE_ENV !== "production") {
      payload.devNowCode = totpCode(secret);
    }

    res.json(payload);
  } catch (error) {
    next(error);
  }
}

export async function verifyTwoFa(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { code } = twoFaVerifyBodySchema.parse(req.body);
    const user = await User.findById(req.userId);
    if (!user) {
      throw new HttpError(404, "User not found");
    }

    if (!user.twoFaSecret) {
      throw new HttpError(400, "2FA not initialized");
    }

    const ok = verifyTotp(String(user.twoFaSecret), String(code), 2);
    if (!ok) {
      throw new HttpError(400, "Invalid 2FA code");
    }

    user.twoFaEnabled = true;
    await user.save();

    res.json({ message: "2FA enabled", user: user.toJSON() });
  } catch (error) {
    next(error);
  }
}

export async function disableTwoFa(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { code } = twoFaDisableBodySchema.parse(req.body);
    const user = await User.findById(req.userId);
    if (!user) {
      throw new HttpError(404, "User not found");
    }

    if (!user.twoFaEnabled || !user.twoFaSecret) {
      res.json({ message: "2FA disabled" });
      return;
    }

    const trimmed = String(code).trim();
    const okTotp = verifyTotp(String(user.twoFaSecret), trimmed);

    let okBackup = false;
    if (!okTotp && Array.isArray(user.twoFaBackupCodeHashes) && user.twoFaBackupCodeHashes.length > 0) {
      const hashes = user.twoFaBackupCodeHashes as unknown as string[];
      for (let i = 0; i < hashes.length; i += 1) {
        const h = hashes[i];
        // eslint-disable-next-line no-await-in-loop
        const match = await bcrypt.compare(trimmed, h);
        if (match) {
          okBackup = true;
          hashes.splice(i, 1);
          user.twoFaBackupCodeHashes = hashes;
          break;
        }
      }
    }

    if (!okTotp && !okBackup) {
      throw new HttpError(400, "Invalid 2FA code");
    }

    user.twoFaEnabled = false;
    user.twoFaSecret = "";
    user.twoFaBackupCodeHashes = [];
    await user.save();

    res.json({ message: "2FA disabled", user: user.toJSON() });
  } catch (error) {
    next(error);
  }
}

export async function updateProfile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const update = updateProfileBodySchema.parse(req.body);

    const user = await User.findByIdAndUpdate(req.userId, { $set: update }, { new: true });
    if (!user) {
      throw new HttpError(404, "User not found");
    }

    res.json({ user: user.toJSON() });
  } catch (error) {
    next(error);
  }
}

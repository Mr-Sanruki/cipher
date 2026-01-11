import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env";

export type JwtPayload = {
  sub: string;
  sid: string;
};

export function signAccessToken(userId: string, sessionId: string): string {
  const payload: JwtPayload = { sub: userId, sid: sessionId };
  const expiresIn: SignOptions["expiresIn"] = env.JWT_EXPIRES_IN as SignOptions["expiresIn"];
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn });
}

export function verifyAccessToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (
    typeof decoded !== "object" ||
    decoded === null ||
    typeof (decoded as any).sub !== "string" ||
    typeof (decoded as any).sid !== "string"
  ) {
    throw new Error("Invalid token payload");
  }
  return decoded as JwtPayload;
}

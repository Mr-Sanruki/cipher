import type { NextFunction, Request, Response } from "express";
import { HttpError } from "./errorHandler";
import { verifyAccessToken } from "../utils/jwt";
import { UserSession } from "../models/UserSession";

 declare global {
   namespace Express {
     interface Request {
       userId: string;
       sessionId: string;
       file?: Express.Multer.File;
       files?: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] };
     }
   }
 }

export type AuthenticatedRequest = Request & { userId: string; sessionId: string };

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  (async () => {
    try {
      const header = req.headers.authorization;
      if (!header?.startsWith("Bearer ")) {
        throw new HttpError(401, "Missing Authorization header");
      }

      const token = header.slice("Bearer ".length).trim();
      if (!token) {
        throw new HttpError(401, "Missing token");
      }

      const payload = verifyAccessToken(token);
      req.userId = payload.sub;
      req.sessionId = payload.sid;

      const session = await UserSession.findOne({ _id: payload.sid, userId: payload.sub }).lean();
      if (!session || session.revokedAt) {
        throw new HttpError(401, "Session expired");
      }

      await UserSession.updateOne({ _id: payload.sid }, { $set: { lastUsedAt: new Date() } }).lean();

      next();
    } catch (error) {
      next(new HttpError(401, "Invalid or expired token"));
    }
  })().catch((e) => next(e));
}

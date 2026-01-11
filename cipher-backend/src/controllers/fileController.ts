import type { Response, NextFunction } from "express";
import path from "path";
import { z } from "zod";
import type { AuthenticatedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

export const uploadFileBodySchema = z.object({
  type: z.enum(["image", "document", "video", "audio"]).optional().default("document"),
});

// For now, we'll return a placeholder URL structure
// In production, you'd upload to S3/Cloudinary/etc. and return real URLs
export async function uploadFile(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // TODO: Implement actual file upload using multer
    // This is a stub that returns a placeholder structure
    // In production, integrate with S3, Cloudinary, or similar

    const body = uploadFileBodySchema.parse(req.body);

    const file = (req as any)?.file as Express.Multer.File | undefined;
    if (!file?.filename) {
      throw new HttpError(400, "Missing file");
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const url = `${baseUrl}/uploads/${encodeURIComponent(file.filename)}`;

    const original = String(file.originalname ?? "").trim();
    const name = original || file.filename;
    const size = Number(file.size ?? 0);

    const ext = path.extname(name).toLowerCase();
    const isImage = body.type === "image" || file.mimetype?.startsWith("image/") || [".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext);
    const type = (isImage ? "image" : body.type) as "image" | "document" | "video" | "audio";

    // For now, return a placeholder structure
    // Real implementation would:
    // 1. Use multer to handle file upload
    // 2. Validate file type and size
    // 3. Upload to storage (S3/Cloudinary/etc.)
    // 4. Return the URL

    res.status(200).json({
      file: {
        id: file.filename,
        url,
        type,
        name,
        size: Number.isFinite(size) ? size : 0,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteFile(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const fileId = String(req.params.fileId);
    if (!fileId) {
      throw new HttpError(400, "Invalid fileId");
    }

    // TODO: Implement actual file deletion
    // In production, delete from storage service

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

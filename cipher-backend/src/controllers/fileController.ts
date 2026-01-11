import type { Response, NextFunction } from "express";
import path from "path";
import { z } from "zod";
import type { AuthenticatedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env";

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
    const body = uploadFileBodySchema.parse(req.body);

    const file = (req as any)?.file as Express.Multer.File | undefined;
    if (!file?.buffer?.length) {
      throw new HttpError(400, "Missing file");
    }

    if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
      throw new HttpError(500, "Cloudinary is not configured");
    }

    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
    });

    const original = String(file.originalname ?? "").trim();
    const name = original || "upload";
    const size = Number(file.size ?? 0);

    const ext = path.extname(name).toLowerCase();
    const isImage = body.type === "image" || file.mimetype?.startsWith("image/") || [".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext);
    const type = (isImage ? "image" : body.type) as "image" | "document" | "video" | "audio";

    const publicId = `${req.userId}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const resourceType: "image" | "video" | "raw" = type === "image" ? "image" : type === "document" ? "raw" : "video";

    const uploadResult = await new Promise<{ public_id: string; secure_url: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          folder: "cipher",
          resource_type: resourceType,
        },
        (error, result) => {
          if (error || !result?.public_id || !result?.secure_url) {
            reject(error ?? new Error("Cloudinary upload failed"));
            return;
          }
          resolve({ public_id: result.public_id, secure_url: result.secure_url });
        }
      );
      stream.end(file.buffer);
    });

    res.status(200).json({
      file: {
        id: uploadResult.public_id,
        url: uploadResult.secure_url,
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

    if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
      throw new HttpError(500, "Cloudinary is not configured");
    }

    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
    });

    const attempts: Array<"image" | "raw" | "video"> = ["image", "raw", "video"];
    let destroyed = false;
    for (const resource_type of attempts) {
      try {
        const result = await cloudinary.uploader.destroy(fileId, { resource_type });
        const r = String((result as any)?.result ?? "");
        if (r === "ok" || r === "not found") {
          destroyed = true;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!destroyed) {
      throw new HttpError(500, "Failed to delete file");
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

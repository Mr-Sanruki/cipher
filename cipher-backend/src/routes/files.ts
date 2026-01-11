import { Router } from "express";
import multer from "multer";
import path from "path";
import { requireAuth } from "../middleware/auth";
import { deleteFile, uploadFile } from "../controllers/fileController";

const router = Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, path.join(process.cwd(), "uploads"));
    },
    filename: (req, file, cb) => {
      const userId = String((req as any)?.userId ?? "user");
      const ext = path.extname(file.originalname || "") || "";
      const safeExt = ext.length <= 12 ? ext : "";
      cb(null, `${userId}_${Date.now()}_${Math.random().toString(16).slice(2)}${safeExt}`);
    },
  }),
  limits: {
    fileSize: 15 * 1024 * 1024,
  },
});

router.post("/upload", requireAuth, upload.single("file"), uploadFile);
router.delete("/:fileId", requireAuth, deleteFile);

export default router;

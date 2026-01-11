import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth";
import { deleteFile, uploadFile } from "../controllers/fileController";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024,
  },
});

router.post("/upload", requireAuth, upload.single("file"), uploadFile);
router.delete("/:fileId", requireAuth, deleteFile);

export default router;

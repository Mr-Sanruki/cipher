import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validation";
import { aiChatBodySchema, chat, chatStream } from "../controllers/aiController";

const router = Router();

router.post("/chat", requireAuth, validateBody(aiChatBodySchema), chat);
router.post("/chat/stream", requireAuth, validateBody(aiChatBodySchema), chatStream);

export default router;

import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validation";
import {
  backfillChatChannels,
  createVideoCallToken,
  createVideoCallTokenBodySchema,
  getChatUserToken,
  getVideoUserToken,
} from "../controllers/streamController";

const router = Router();

router.get("/video/token", requireAuth, getVideoUserToken);
router.post("/video/call-token", requireAuth, validateBody(createVideoCallTokenBodySchema), createVideoCallToken);

router.get("/chat/token", requireAuth, getChatUserToken);

router.post("/chat/backfill", requireAuth, backfillChatChannels);

export default router;

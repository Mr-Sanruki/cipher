import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validation";
import {
  createFocusSession,
  createFocusSessionBodySchema,
  deleteFocusSession,
  listFocusSessions,
  updateFocusSession,
  updateFocusSessionBodySchema,
} from "../controllers/focusSessionController";

const router = Router();

router.get("/", requireAuth, listFocusSessions);
router.post("/", requireAuth, validateBody(createFocusSessionBodySchema), createFocusSession);
router.put("/:sessionId", requireAuth, validateBody(updateFocusSessionBodySchema), updateFocusSession);
router.delete("/:sessionId", requireAuth, deleteFocusSession);

export default router;

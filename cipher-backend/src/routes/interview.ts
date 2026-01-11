import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validation";
import { interviewRunBodySchema, runCode } from "../controllers/interviewController";

const router = Router();

router.post("/run", requireAuth, validateBody(interviewRunBodySchema), runCode);

export default router;

import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validation";
import { sendEmail, sendEmailBodySchema } from "../controllers/emailController";

const router = Router();

router.post("/send", requireAuth, validateBody(sendEmailBodySchema), sendEmail);

export default router;

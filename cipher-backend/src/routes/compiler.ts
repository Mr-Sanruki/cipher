import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validation";
import { runCompiler, compilerRunBodySchema } from "../controllers/compilerController";

const router = Router();

router.post("/", requireAuth, validateBody(compilerRunBodySchema), runCompiler);

export default router;

import { Router } from "express";
import { validateBody } from "../middleware/validation";
import {
  login,
  loginBodySchema,
  logout,
  refresh,
  requestOtp,
  requestOtpBodySchema,
  signup,
  signupBodySchema,
  verifyOtp,
  verifyOtpBodySchema,
} from "../controllers/authController";

const router = Router();

router.post("/signup", validateBody(signupBodySchema), signup);
router.post("/request-otp", validateBody(requestOtpBodySchema), requestOtp);
router.post("/verify-otp", validateBody(verifyOtpBodySchema), verifyOtp);
router.post("/login", validateBody(loginBodySchema), login);
router.post("/refresh", refresh);
router.post("/logout", logout);

export default router;

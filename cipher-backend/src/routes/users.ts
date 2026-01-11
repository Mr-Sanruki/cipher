import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  changePassword,
  deleteAccount,
  getProfile,
  listSessions,
  requestEmailChange,
  revokeAllOtherSessions,
  revokeSession,
  setupTwoFa,
  updateProfile,
  verifyTwoFa,
  disableTwoFa,
  verifyEmailChange,
} from "../controllers/userController";

const router = Router();

router.get("/profile", requireAuth, getProfile);
router.put("/profile", requireAuth, updateProfile);

router.post("/change-password", requireAuth, changePassword);
router.post("/delete-account", requireAuth, deleteAccount);

router.post("/request-email-change", requireAuth, requestEmailChange);
router.post("/verify-email-change", requireAuth, verifyEmailChange);

router.get("/sessions", requireAuth, listSessions);
router.post("/sessions/revoke", requireAuth, revokeSession);
router.post("/sessions/revoke-others", requireAuth, revokeAllOtherSessions);

router.post("/2fa/setup", requireAuth, setupTwoFa);
router.post("/2fa/verify", requireAuth, verifyTwoFa);
router.post("/2fa/disable", requireAuth, disableTwoFa);

export default router;

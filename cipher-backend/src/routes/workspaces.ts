import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validation";
import {
  createWorkspace,
  createWorkspaceBodySchema,
  generateCode,
  joinWorkspace,
  joinWorkspaceBodySchema,
  listMembers,
  listWorkspaces,
  removeMember,
  updateMemberRole,
  updateMemberRoleBodySchema,
  updateWorkspace,
  updateWorkspaceBodySchema,
} from "../controllers/workspaceController";

const router = Router();

router.post("/", requireAuth, validateBody(createWorkspaceBodySchema), createWorkspace);
router.get("/", requireAuth, listWorkspaces);
router.post("/join", requireAuth, validateBody(joinWorkspaceBodySchema), joinWorkspace);
router.put("/:workspaceId", requireAuth, validateBody(updateWorkspaceBodySchema), updateWorkspace);
router.get("/:workspaceId/members", requireAuth, listMembers);
router.put(
  "/:workspaceId/members/:userId/role",
  requireAuth,
  validateBody(updateMemberRoleBodySchema),
  updateMemberRole,
);
router.delete("/:workspaceId/members/:userId", requireAuth, removeMember);
router.post("/:workspaceId/generate-code", requireAuth, generateCode);

export default router;

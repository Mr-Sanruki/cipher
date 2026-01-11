import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validation";
import {
  createDirectMessage,
  createDirectMessageBodySchema,
  createDirectMessageContent,
  createDirectMessageContentBodySchema,
  addGroupMembers,
  addGroupMembersBodySchema,
  archiveDirectMessage,
  deleteDirectMessage,
  deleteDirectMessageContent,
  getDirectMessage,
  listDirectMessageContent,
  listDirectMessages,
  leaveGroup,
  reactDirectMessageBodySchema,
  reactDirectMessageContent,
  renameGroup,
  renameGroupBodySchema,
  updateDirectMessageContent,
  updateDirectMessageContentBodySchema,
  updateGroupAdmin,
  updateGroupAdminBodySchema,
  removeGroupMember,
  getDirectMessageThread,
} from "../controllers/directMessageController";

const router = Router();

router.post("/", requireAuth, validateBody(createDirectMessageBodySchema), createDirectMessage);
router.get("/", requireAuth, listDirectMessages);
router.post(
  "/messages",
  requireAuth,
  validateBody(createDirectMessageContentBodySchema),
  createDirectMessageContent,
);
router.get("/thread/:threadRootId", requireAuth, getDirectMessageThread);

router.get("/:dmId/messages", requireAuth, listDirectMessageContent);

router.get("/:dmId", requireAuth, getDirectMessage);

router.patch("/:dmId/name", requireAuth, validateBody(renameGroupBodySchema), renameGroup);
router.post("/:dmId/members", requireAuth, validateBody(addGroupMembersBodySchema), addGroupMembers);
router.delete("/:dmId/members/:userId", requireAuth, removeGroupMember);
router.patch("/:dmId/admins", requireAuth, validateBody(updateGroupAdminBodySchema), updateGroupAdmin);
router.post("/:dmId/leave", requireAuth, leaveGroup);

router.post("/:dmId/archive", requireAuth, archiveDirectMessage);
router.delete("/:dmId", requireAuth, deleteDirectMessage);

router.put(
  "/messages/:messageId",
  requireAuth,
  validateBody(updateDirectMessageContentBodySchema),
  updateDirectMessageContent,
);
router.delete("/messages/:messageId", requireAuth, deleteDirectMessageContent);
router.post(
  "/messages/:messageId/reactions",
  requireAuth,
  validateBody(reactDirectMessageBodySchema),
  reactDirectMessageContent,
);

export default router;

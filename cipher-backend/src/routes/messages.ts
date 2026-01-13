import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validation";
import {
  createMessage,
  createMessageBodySchema,
  deleteMessage,
  getThread,
  getPinnedMessages,
  listMessages,
  pinMessage,
  reactBodySchema,
  reactMessage,
  voteMessagePoll,
  votePollBodySchema,
  searchMessages,
  unpinMessage,
  updateMessage,
  updateMessageBodySchema,
} from "../controllers/messageController";

const router = Router();

router.post("/", requireAuth, validateBody(createMessageBodySchema), createMessage);
router.get("/search", requireAuth, searchMessages);
router.get("/thread/:threadRootId", requireAuth, getThread);
router.get("/:channelId", requireAuth, listMessages);
router.get("/:channelId/pinned", requireAuth, getPinnedMessages);
router.put("/:messageId", requireAuth, validateBody(updateMessageBodySchema), updateMessage);
router.delete("/:messageId", requireAuth, deleteMessage);
router.post("/:messageId/reactions", requireAuth, validateBody(reactBodySchema), reactMessage);
router.post("/:messageId/poll-vote", requireAuth, validateBody(votePollBodySchema), voteMessagePoll);
router.post("/:messageId/pin", requireAuth, pinMessage);
router.post("/:messageId/unpin", requireAuth, unpinMessage);

export default router;

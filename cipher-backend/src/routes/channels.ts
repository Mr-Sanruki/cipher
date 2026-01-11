import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validation";
import {
  addMember,
  addMemberBodySchema,
  createChannel,
  createChannelBodySchema,
  deleteChannel,
  getChannel,
  listChannels,
  removeMember,
  updateChannel,
  updateChannelBodySchema,
} from "../controllers/channelController";

const router = Router();

router.post("/", requireAuth, validateBody(createChannelBodySchema), createChannel);
router.get("/", requireAuth, listChannels);
router.get("/:channelId", requireAuth, getChannel);
router.put("/:channelId", requireAuth, validateBody(updateChannelBodySchema), updateChannel);
router.delete("/:channelId", requireAuth, deleteChannel);
router.post("/:channelId/members", requireAuth, validateBody(addMemberBodySchema), addMember);
router.delete("/:channelId/members/:userId", requireAuth, removeMember);

export default router;

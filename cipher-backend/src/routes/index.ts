import { Router } from "express";
import authRoutes from "./auth";
import aiRoutes from "./ai";
import interviewRoutes from "./interview";
import usersRoutes from "./users";
import workspacesRoutes from "./workspaces";
import channelsRoutes from "./channels";
import messagesRoutes from "./messages";
import directMessagesRoutes from "./directMessages";
import filesRoutes from "./files";
import streamRoutes from "./stream";
import tasksRoutes from "./tasks";
import focusSessionsRoutes from "./focusSessions";
import habitsRoutes from "./habits";
import notesRoutes from "./notes";
import compilerRoutes from "./compiler";
import emailRoutes from "./email";

const router = Router();

router.use("/interview", interviewRoutes);
router.use("/ai", aiRoutes);
router.use("/auth", authRoutes);
router.use("/users", usersRoutes);
router.use("/workspaces", workspacesRoutes);
router.use("/channels", channelsRoutes);
router.use("/messages", messagesRoutes);
router.use("/dms", directMessagesRoutes);
router.use("/files", filesRoutes);
router.use("/stream", streamRoutes);
router.use("/tasks", tasksRoutes);
router.use("/focus_sessions", focusSessionsRoutes);
router.use("/habits", habitsRoutes);
router.use("/notes", notesRoutes);
router.use("/compiler", compilerRoutes);
router.use("/email", emailRoutes);

export default router;

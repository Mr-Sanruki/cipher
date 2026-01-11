import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validation";
import { createTask, createTaskBodySchema, deleteTask, listTasks, updateTask, updateTaskBodySchema } from "../controllers/tasksController";

const router = Router();

router.get("/", requireAuth, listTasks);
router.post("/", requireAuth, validateBody(createTaskBodySchema), createTask);
router.put("/:taskId", requireAuth, validateBody(updateTaskBodySchema), updateTask);
router.delete("/:taskId", requireAuth, deleteTask);

export default router;

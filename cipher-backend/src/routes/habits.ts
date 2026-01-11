import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validation";
import { createHabit, createHabitBodySchema, deleteHabit, listHabits, updateHabit, updateHabitBodySchema } from "../controllers/habitsController";

const router = Router();

router.get("/", requireAuth, listHabits);
router.post("/", requireAuth, validateBody(createHabitBodySchema), createHabit);
router.put("/:habitId", requireAuth, validateBody(updateHabitBodySchema), updateHabit);
router.delete("/:habitId", requireAuth, deleteHabit);

export default router;

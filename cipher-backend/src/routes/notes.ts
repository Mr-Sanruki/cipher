import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validation";
import { createNote, createNoteBodySchema, deleteNote, listNotes, updateNote, updateNoteBodySchema } from "../controllers/notesController";

const router = Router();

router.get("/", requireAuth, listNotes);
router.post("/", requireAuth, validateBody(createNoteBodySchema), createNote);
router.put("/:noteId", requireAuth, validateBody(updateNoteBodySchema), updateNote);
router.delete("/:noteId", requireAuth, deleteNote);

export default router;

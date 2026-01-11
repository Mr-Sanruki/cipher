import api from "./api";

export type NoteDto = {
  _id: string;
  workspaceId: string;
  createdBy: string;
  title?: string;
  content?: string;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
};

export async function listNotes(input: { workspaceId: string; q?: string }): Promise<NoteDto[]> {
  const res = await api.get("/api/notes", { params: { workspaceId: input.workspaceId, q: input.q } });
  const notes = (res.data as any)?.notes;
  return Array.isArray(notes) ? (notes as NoteDto[]) : [];
}

export async function createNote(input: {
  workspaceId: string;
  title?: string;
  content?: string;
  tags?: string[];
}): Promise<NoteDto> {
  const res = await api.post("/api/notes", input);
  const note = (res.data as any)?.note as NoteDto | undefined;
  if (!note?._id) throw new Error("Invalid create note response");
  return note;
}

export async function updateNote(
  noteId: string,
  input: {
    title?: string;
    content?: string;
    tags?: string[];
  },
): Promise<NoteDto> {
  const res = await api.put(`/api/notes/${noteId}`, input);
  const note = (res.data as any)?.note as NoteDto | undefined;
  if (!note?._id) throw new Error("Invalid update note response");
  return note;
}

export async function deleteNote(noteId: string): Promise<void> {
  await api.delete(`/api/notes/${noteId}`);
}

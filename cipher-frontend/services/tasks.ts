import api from "./api";

export type TaskDto = {
  _id: string;
  workspaceId: string;
  createdBy: string;
  title: string;
  note?: string;
  status?: "todo" | "doing" | "done";
  priority?: "low" | "medium" | "high";
  dueAt?: string | null;
  order?: number;
  createdAt?: string;
  updatedAt?: string;
};

export async function listTasks(workspaceId: string): Promise<TaskDto[]> {
  const res = await api.get("/api/tasks", { params: { workspaceId } });
  const tasks = (res.data as any)?.tasks;
  return Array.isArray(tasks) ? (tasks as TaskDto[]) : [];
}

export async function createTask(input: {
  workspaceId: string;
  title: string;
  note?: string;
  priority?: "low" | "medium" | "high";
  status?: "todo" | "doing" | "done";
  dueAt?: string | null;
  order?: number;
}): Promise<TaskDto> {
  const res = await api.post("/api/tasks", input);
  const task = (res.data as any)?.task as TaskDto | undefined;
  if (!task?._id) throw new Error("Invalid create task response");
  return task;
}

export async function updateTask(
  taskId: string,
  input: {
    title?: string;
    note?: string;
    priority?: "low" | "medium" | "high";
    status?: "todo" | "doing" | "done";
    dueAt?: string | null;
    order?: number;
  },
): Promise<TaskDto> {
  const res = await api.put(`/api/tasks/${taskId}`, input);
  const task = (res.data as any)?.task as TaskDto | undefined;
  if (!task?._id) throw new Error("Invalid update task response");
  return task;
}

export async function deleteTask(taskId: string): Promise<void> {
  await api.delete(`/api/tasks/${taskId}`);
}

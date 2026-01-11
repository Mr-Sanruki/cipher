import api from "./api";

export type HabitLogDto = {
  date: string; // YYYY-MM-DD
  completed: boolean;
};

export type HabitDto = {
  _id: string;
  workspaceId: string;
  createdBy: string;
  name: string;
  color?: string;
  logs?: HabitLogDto[];
  createdAt?: string;
  updatedAt?: string;
};

export async function listHabits(workspaceId: string): Promise<HabitDto[]> {
  const res = await api.get("/api/habits", { params: { workspaceId } });
  const habits = (res.data as any)?.habits;
  return Array.isArray(habits) ? (habits as HabitDto[]) : [];
}

export async function createHabit(input: { workspaceId: string; name: string; color?: string }): Promise<HabitDto> {
  const res = await api.post("/api/habits", input);
  const habit = (res.data as any)?.habit as HabitDto | undefined;
  if (!habit?._id) throw new Error("Invalid create habit response");
  return habit;
}

export async function updateHabit(
  habitId: string,
  input: { name?: string; color?: string; toggleDate?: string; completed?: boolean },
): Promise<HabitDto> {
  const res = await api.put(`/api/habits/${habitId}`, input);
  const habit = (res.data as any)?.habit as HabitDto | undefined;
  if (!habit?._id) throw new Error("Invalid update habit response");
  return habit;
}

export async function deleteHabit(habitId: string): Promise<void> {
  await api.delete(`/api/habits/${habitId}`);
}

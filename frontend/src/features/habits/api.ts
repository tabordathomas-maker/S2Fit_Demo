import { apiFetch } from "../../services/api";
import type { HabitSummary } from "../../services/types";

export const habitsApi = {
  summary: (date?: string) => apiFetch<HabitSummary>("/api/v1/habits", { query: { date } }),
  setLog: (habitId: number, date: string, completed: boolean) =>
    apiFetch<HabitSummary>(`/api/v1/habits/${habitId}/log`, { method: "PUT", body: { date, completed } }),
  create: (name: string) => apiFetch<HabitSummary>("/api/v1/habits", { method: "POST", body: { name } }),
  remove: (habitId: number) => apiFetch<HabitSummary>(`/api/v1/habits/${habitId}`, { method: "DELETE" }),
};

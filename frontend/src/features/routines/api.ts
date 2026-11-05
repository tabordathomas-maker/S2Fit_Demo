import { apiFetch } from "../../services/api";

export type StepState = "done" | "current" | "locked" | "available";

export interface StepCompletion {
  completed_at: string;
  minutes: number | null;
  effort: number | null;
  note: string | null;
}

export interface RoutineStats {
  progress_pct: number;
  completed_steps: number;
  total_steps: number;
  total_minutes: number;
  avg_effort: number | null;
  current_streak_days: number;
  last_completed_at: string | null;
  next_step: { id: number; title: string } | null;
  weekly: { week_start: string; completions: number; minutes: number }[];
}

export interface RoutineSummary {
  id: number;
  title: string;
  goal: string | null;
  status: "active" | "archived";
  progress_pct: number;
  completed_steps: number;
  total_steps: number;
  stats: RoutineStats | null;
}

export interface RoutineStep {
  id: number;
  position: number;
  title: string;
  block_label: string | null;
  sets_reps: string | null;
  duration_minutes: number | null;
  instructions: string | null;
  media_url: string | null;
  cover_url: string | null;
  state: StepState;
  completion: StepCompletion | null;
}

export interface RoutineDetail {
  id: number;
  title: string;
  description: string | null;
  goal: string | null;
  status: string;
  sequential: boolean;
  steps: RoutineStep[];
  stats: RoutineStats;
}

export interface CompleteBody {
  minutes?: number | null;
  effort?: number | null;
  note?: string | null;
}

const R = "/api/v1/routines";

export const routinesApi = {
  list: () => apiFetch<RoutineSummary[]>(R),
  get: (id: number) => apiFetch<RoutineDetail>(`${R}/${id}`),
  complete: (id: number, stepId: number, body: CompleteBody) =>
    apiFetch<RoutineDetail>(`${R}/${id}/steps/${stepId}/complete`, { method: "POST", body }),
  undo: (id: number, stepId: number) => apiFetch<RoutineDetail>(`${R}/${id}/steps/${stepId}/complete`, { method: "DELETE" }),
};

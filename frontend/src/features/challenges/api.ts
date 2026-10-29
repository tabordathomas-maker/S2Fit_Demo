import { apiFetch } from "../../services/api";
import type { ChallengesSummary, RewardsSummary } from "../../services/types";

export const challengesApi = {
  list: () => apiFetch<ChallengesSummary>("/api/v1/challenges"),
  join: (id: number) => apiFetch<ChallengesSummary>(`/api/v1/challenges/${id}/join`, { method: "POST" }),
  progress: (id: number) => apiFetch<ChallengesSummary>(`/api/v1/challenges/${id}/progress`, { method: "POST" }),
  rewards: () => apiFetch<RewardsSummary>("/api/v1/rewards"),
  redeem: (id: number) => apiFetch<{ message: string }>(`/api/v1/rewards/${id}/redeem`, { method: "POST" }),
};

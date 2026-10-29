import { apiFetch } from "../../services/api";
import type { MembershipStatus, Plan, SubscriptionRequestCreated } from "../../services/types";

export const PENDING_PLAN_KEY = "s2fit:pending-plan";

export const subscriptionsApi = {
  plans: () => apiFetch<Plan[]>("/api/v1/plans"),
  membership: () => apiFetch<MembershipStatus>("/api/v1/subscriptions/me"),
  request: (planCode: string) =>
    apiFetch<SubscriptionRequestCreated>("/api/v1/subscriptions/requests", {
      method: "POST",
      body: { plan_code: planCode },
    }),
};

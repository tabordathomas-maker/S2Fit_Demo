import { apiFetch } from "../../services/api";

export type NotificationKind = "order" | "subscription" | "box_claim" | "mi_ruta";
export type NotificationStatus = "pending" | "accepted" | "rejected";

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  reference: string;
  title: string;
  status: NotificationStatus;
  status_label: string;
  occurred_at: string;
  link: string;
  unread: boolean;
}

export interface NotificationFeed {
  items: NotificationItem[];
  unread_count: number;
}

export const notificationsApi = {
  feed: () => apiFetch<NotificationFeed>("/api/v1/notifications"),
  markSeen: () => apiFetch<NotificationFeed>("/api/v1/notifications/seen", { method: "POST" }),
};

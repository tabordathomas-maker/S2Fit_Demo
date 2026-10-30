import { apiFetch } from "../../services/api";
import type { Category, ContentKind, Order, PaymentMethod, PaymentStatus, Plan, Profile, Subscription, SubscriptionRequest } from "../../services/types";

export interface AdminPayment {
  id: string;
  kind: "order" | "subscription";
  status: PaymentStatus;
  amount: number | null;
  method: PaymentMethod | null;
  operation_reference: string;
  created_at: string;
  decided_at: string | null;
  user_id: string;
  customer_email: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  order_id: string | null;
  subscription_request_id: string | null;
  plan_name: string | null;
  external_reference: string | null;
  admin_notes: string | null;
  decided_by: string | null;
  decided_by_email: string | null;
  reservation_expires_at: string | null;
  reservation_status: string | null;
}

export interface AdminOrder extends Order {
  user_id: string;
  customer_email: string | null;
  customer_name: string | null;
}

export interface AdminVariant {
  id: number;
  sku: string;
  size: string;
  color: string;
  unit_price: number;
  available: number;
  is_active: boolean;
  price_override: number | null;
  stock_on_hand: number;
  stock_reserved: number;
}

export interface AdminProduct {
  id: number;
  category_id: number;
  name: string;
  slug: string;
  description: string | null;
  base_price: number;
  image_url: string | null;
  is_active: boolean;
  is_demo: boolean;
  variants: AdminVariant[];
}

export interface AdminSubscriptionRequest extends SubscriptionRequest {
  user_id: string;
  customer_email: string | null;
  customer_name: string | null;
  payment_id: string | null;
  payment_status: PaymentStatus | null;
}

export interface AdminSubscription extends Subscription {
  user_id: string;
  customer_email: string | null;
  customer_name: string | null;
}

export interface AdminContent {
  id: number;
  kind: ContentKind;
  title: string;
  summary: string | null;
  body: string | null;
  media_url: string | null;
  cover_url: string | null;
  meta: string | null;
  meal_slot: string | null;
  access: "free" | "plus";
  is_published: boolean;
  is_demo: boolean;
  sort_order: number;
}

export interface AdminChallenge {
  id: number;
  title: string;
  description: string | null;
  access: "free" | "plus";
  target_count: number;
  is_active: boolean;
  is_demo: boolean;
  sort_order: number;
}

export interface AdminReward {
  id: number;
  kind: "habit_discount" | "challenge";
  name: string;
  description: string | null;
  threshold_pct: number;
  access: "free" | "plus";
  is_active: boolean;
  is_demo: boolean;
  sort_order: number;
}

export interface AdminRedemption {
  id: number;
  reward_id: number;
  reward_name: string;
  user_id: string;
  customer_email: string | null;
  status: "requested" | "fulfilled" | "cancelled";
  admin_notes: string | null;
  created_at: string;
  fulfilled_at: string | null;
}

export interface AuditLog {
  id: number;
  admin_id: string;
  admin_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface AdminSettings {
  whatsapp_number: string | null;
  updated_at: string | null;
  updated_by_email: string | null;
}

const A = "/api/v1/admin";
const post = <T,>(path: string, body?: unknown) => apiFetch<T>(A + path, { method: "POST", body });
const patch = <T,>(path: string, body: unknown) => apiFetch<T>(A + path, { method: "PATCH", body });

export const adminApi = {
  payments: (status?: PaymentStatus[]) => apiFetch<AdminPayment[]>(`${A}/payments`, { query: { status } }),
  reviewPayment: (id: string, body: { method?: PaymentMethod; admin_notes?: string }) => post<AdminPayment>(`/payments/${id}/review`, body),
  confirmPayment: (id: string, body: { operation_reference: string; amount: number; method: PaymentMethod; external_reference: string; admin_notes?: string }) =>
    post<AdminPayment>(`/payments/${id}/confirm`, body),
  rejectPayment: (id: string, admin_notes: string) => post<AdminPayment>(`/payments/${id}/reject`, { admin_notes }),
  refundPayment: (id: string, admin_notes: string) => post<AdminPayment>(`/payments/${id}/refund`, { admin_notes }),

  orders: (status?: string, q?: string) => apiFetch<AdminOrder[]>(`${A}/orders`, { query: { status, q } }),
  expireReservations: () => post<{ expired_orders: number }>("/orders/expire-reservations"),
  renewReservation: (id: string) => post<AdminOrder>(`/orders/${id}/renew-reservation`),
  cancelOrder: (id: string, reason: string) => post<AdminOrder>(`/orders/${id}/cancel`, { reason }),

  categories: () => apiFetch<Category[]>(`${A}/categories`),
  createCategory: (body: { name: string; slug: string }) => post<Category>("/categories", body),
  products: () => apiFetch<AdminProduct[]>(`${A}/products`),
  createProduct: (body: Record<string, unknown>) => post<AdminProduct>("/products", body),
  updateProduct: (id: number, body: Record<string, unknown>) => patch<AdminProduct>(`/products/${id}`, body),
  createVariant: (productId: number, body: Record<string, unknown>) => post<AdminVariant>(`/products/${productId}/variants`, body),
  updateVariant: (id: number, body: Record<string, unknown>) => patch<AdminVariant>(`/variants/${id}`, body),
  adjustStock: (id: number, delta: number, note: string) => post<AdminVariant>(`/variants/${id}/stock`, { delta, note }),
  uploadImage: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<{ url: string }>(`${A}/uploads/product-image`, { method: "POST", formData: form });
  },
  uploadContentMedia: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<{ url: string; media_type: "image" | "video" }>(`${A}/uploads/content-media`, { method: "POST", formData: form });
  },

  settings: () => apiFetch<AdminSettings>(`${A}/settings`),
  updateSettings: (whatsapp_number: string | null) =>
    apiFetch<AdminSettings>(`${A}/settings`, { method: "PUT", body: { whatsapp_number } }),

  plans: () => apiFetch<Plan[]>(`${A}/plans`),
  createPlan: (body: Record<string, unknown>) => post<Plan>("/plans", body),
  updatePlan: (id: number, body: Record<string, unknown>) => patch<Plan>(`/plans/${id}`, body),
  subscriptionRequests: (status?: string) => apiFetch<AdminSubscriptionRequest[]>(`${A}/subscription-requests`, { query: { status } }),
  setTerms: (id: string, agreed_price: number, agreed_duration_days: number) =>
    post<AdminSubscriptionRequest>(`/subscription-requests/${id}/terms`, { agreed_price, agreed_duration_days }),
  subscriptions: (status?: string) => apiFetch<AdminSubscription[]>(`${A}/subscriptions`, { query: { status } }),
  cancelSubscription: (id: string, reason: string) => post<AdminSubscription>(`/subscriptions/${id}/cancel`, { reason }),

  content: () => apiFetch<AdminContent[]>(`${A}/content`),
  createContent: (body: Record<string, unknown>) => post<AdminContent>("/content", body),
  updateContent: (id: number, body: Record<string, unknown>) => patch<AdminContent>(`/content/${id}`, body),
  challenges: () => apiFetch<AdminChallenge[]>(`${A}/challenges`),
  createChallenge: (body: Record<string, unknown>) => post<AdminChallenge>("/challenges", body),
  updateChallenge: (id: number, body: Record<string, unknown>) => patch<AdminChallenge>(`/challenges/${id}`, body),
  rewards: () => apiFetch<AdminReward[]>(`${A}/rewards`),
  createReward: (body: Record<string, unknown>) => post<AdminReward>("/rewards", body),
  updateReward: (id: number, body: Record<string, unknown>) => patch<AdminReward>(`/rewards/${id}`, body),
  redemptions: () => apiFetch<AdminRedemption[]>(`${A}/redemptions`),
  decideRedemption: (id: number, status: "fulfilled" | "cancelled", admin_notes?: string) =>
    post<AdminRedemption>(`/redemptions/${id}/decision`, { status, admin_notes }),

  profiles: (q?: string) => apiFetch<Profile[]>(`${A}/profiles`, { query: { q } }),
  auditLogs: (action?: string) => apiFetch<AuditLog[]>(`${A}/audit-logs`, { query: { action } }),
};

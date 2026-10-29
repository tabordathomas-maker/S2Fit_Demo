import { apiFetch } from "../../services/api";
import type { Order, OrderWithMessage, Payment } from "../../services/types";

export interface OrderLine {
  variant_id: number;
  quantity: number;
}

export const ordersApi = {
  // Solo se envían variantes y cantidades: el precio lo calcula el servidor.
  create: (items: OrderLine[], customerNote?: string) =>
    apiFetch<OrderWithMessage>("/api/v1/orders", {
      method: "POST",
      body: { items, customer_note: customerNote || null },
    }),
  list: () => apiFetch<Order[]>("/api/v1/orders"),
  get: (reference: string) => apiFetch<OrderWithMessage>(`/api/v1/orders/${encodeURIComponent(reference)}`),
  cancel: (reference: string) =>
    apiFetch<Order>(`/api/v1/orders/${encodeURIComponent(reference)}/cancel`, { method: "POST" }),
  payments: () => apiFetch<Payment[]>("/api/v1/me/payments"),
};

import { config } from "../config";

export function formatCOP(amount: number): string {
  return "$" + String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " COP";
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

/** Las imágenes del catálogo pueden ser URLs absolutas (Supabase Storage) o rutas del sitio. */
export function resolveImage(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;
  return config.baseUrl + url.replace(/^\/+/, "");
}

export const orderStatusLabel: Record<string, string> = {
  pending_payment: "Pendiente de pago",
  paid: "Pagado",
  cancelled: "Cancelado",
  expired: "Reserva vencida",
  refunded: "Reembolsado",
};

export const paymentStatusLabel: Record<string, string> = {
  pending: "Pendiente",
  in_review: "En revisión",
  confirmed: "Confirmado",
  rejected: "Rechazado",
  refunded: "Reembolsado",
  cancelled: "Cancelado",
};

export const paymentMethodLabel: Record<string, string> = {
  transfer: "Transferencia",
  deposit: "Consignación",
  cash: "Efectivo",
  other: "Otro medio del convenio",
};

export const subscriptionStatusLabel: Record<string, string> = {
  pending_payment: "Pendiente de pago",
  active: "Activa",
  expired: "Vencida",
  cancelled: "Cancelada",
};

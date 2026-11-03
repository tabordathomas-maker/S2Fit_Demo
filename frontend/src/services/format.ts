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

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Fecha corta en hora de Colombia: "15 dic 2026". */
export function formatShortDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const [year, month, day] = new Date(value).toLocaleDateString("en-CA", { timeZone: "America/Bogota" }).split("-");
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

/** Estado de S2 Plus en palabras para el panel de administración. */
export function plusStatusText(status: string, endsAt: string | null): string {
  switch (status) {
    case "active":
      return `Activa hasta ${formatShortDate(endsAt)}`;
    case "expired":
      return `Vencida el ${formatShortDate(endsAt)}`;
    case "cancelled":
      return "Cancelada";
    case "pending_payment":
      return "Pago pendiente";
    default:
      return "Sin S2 Plus";
  }
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

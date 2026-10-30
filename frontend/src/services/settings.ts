import { config } from "../config";
import { apiFetch } from "./api";

export interface PublicSettings {
  whatsapp_number: string | null;
}

/** Aplica el número de WhatsApp que el administrador guardó en el panel. */
export function applyWhatsAppNumber(number: string | null | undefined): void {
  const digits = (number ?? "").replace(/\D/g, "");
  if (digits) config.whatsappNumber = digits;
}

/**
 * Lee la configuración pública de la API al cargar el sitio. Si la API no responde
 * (por ejemplo, Render está despertando), se conserva VITE_WHATSAPP_BUSINESS_NUMBER.
 */
export async function loadPublicSettings(): Promise<void> {
  try {
    const settings = await apiFetch<PublicSettings>("/api/v1/settings");
    applyWhatsAppNumber(settings.whatsapp_number);
  } catch {
    // Sin conexión: se usa el número de respaldo del archivo .env (si existe).
  }
}

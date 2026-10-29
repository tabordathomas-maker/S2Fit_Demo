import { config } from "../config";

/** Arma el enlace https://wa.me/NUMERO?text=MENSAJE. Devuelve null si no hay número configurado. */
export function buildWhatsAppUrl(message: string, number: string = config.whatsappNumber): string | null {
  const digits = number.replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/** Envoltorio de la redirección para poder sustituirla en las pruebas. */
export const navigation = {
  redirect(url: string) {
    window.location.assign(url);
  },
};

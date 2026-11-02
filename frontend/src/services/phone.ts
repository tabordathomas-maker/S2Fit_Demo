/** Celulares colombianos: se escriben con o sin espacios y se guardan como 10 dígitos ("3001234567"). */

export const PHONE_ERROR = "Escribe tu celular de 10 dígitos, por ejemplo 300 123 4567.";

/** Deja solo dígitos; si quedan 12 y empiezan por 57, quita el indicativo. */
export function cleanPhone(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("57") ? digits.slice(2) : digits;
}

export function isValidPhone(raw: string | null | undefined): boolean {
  return /^3\d{9}$/.test(cleanPhone(raw));
}

/** "3001234567" y "573001234567" se muestran como "300 123 4567"; lo demás se devuelve igual. */
export function formatPhone(raw: string | null | undefined): string {
  const text = raw ?? "";
  const digits = cleanPhone(text);
  if (digits.length !== 10) return text;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

/** Valor listo para enviar al servidor: 10 dígitos, o null si es opcional y está vacío. */
export function phoneForSubmit(raw: string, required = false): string | null {
  if (!raw.trim()) {
    if (required) throw new Error(PHONE_ERROR);
    return null;
  }
  if (!/^[0-9+\s().-]+$/.test(raw) || !isValidPhone(raw)) throw new Error(PHONE_ERROR);
  return cleanPhone(raw);
}

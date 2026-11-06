/** Código de acceso a Mi Ruta guardado en el navegador (sin cuenta se envía en el header X-MiRuta-Code). */

const KEY = "s2.miRutaCode";

export const MI_RUTA_HEADER = "X-MiRuta-Code";

/** «k7m-2qx» -> «K7M2QX»: mayúsculas, sin espacios ni guiones. */
export function normalizeCode(raw: string): string {
  return raw.replace(/[\s\-_]+/g, "").toUpperCase();
}

const listeners = new Set<() => void>();

/** Avisa a quien muestre el acceso (menú, página) que debe consultarlo de nuevo. */
export function subscribeMiRutaAccess(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyMiRutaAccessChanged(): void {
  listeners.forEach((listener) => listener());
}

export function getStoredCode(): string | null {
  try {
    return localStorage.getItem(KEY) || null;
  } catch {
    return null;
  }
}

export function storeCode(code: string): void {
  try {
    localStorage.setItem(KEY, normalizeCode(code));
  } catch {
    // Sin almacenamiento (navegación privada): el código vale solo para esta visita.
  }
  notifyMiRutaAccessChanged();
}

export function clearStoredCode(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nada que borrar.
  }
  notifyMiRutaAccessChanged();
}

/** Enlace que lleva el QR: abre Mi Ruta con el código ya puesto. */
export function accessLink(code: string, origin: string, baseUrl: string): string {
  return `${origin}${baseUrl}#/mi-ruta/acceso/${code}`;
}

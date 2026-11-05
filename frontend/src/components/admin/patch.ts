/** Devuelve solo los campos de `current` que cambiaron respecto a `initial` (para enviar un PATCH mínimo). */
export function diffPatch<T extends Record<string, unknown>>(initial: T, current: T): Partial<T> {
  const patch: Partial<T> = {};
  for (const key of Object.keys(current) as (keyof T)[]) {
    if (JSON.stringify(initial[key]) !== JSON.stringify(current[key])) patch[key] = current[key];
  }
  return patch;
}

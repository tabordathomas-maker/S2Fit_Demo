const CODE_MAX = 40;

/**
 * Misma regla que el backend (`slugify_code`): sin tildes, minúsculas, todo lo que no sea [a-z0-9] pasa a «-»,
 * se colapsan los guiones, se recorta a 40 y, si queda con menos de 2 caracteres, el código es «plan».
 */
export function slugifyCode(name: string): string {
  const ascii = name.normalize("NFKD").replace(/[^\x00-\x7F]/g, "").toLowerCase();
  const slug = ascii.replace(/[^a-z0-9]/g, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "").slice(0, CODE_MAX).replace(/-+$/, "");
  return slug.length >= 2 ? slug : "plan";
}

/** Sin espacios al inicio ni al final y con los espacios internos repetidos colapsados. */
export function normalizePlanName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

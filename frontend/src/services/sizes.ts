/** Tallas conocidas, en el orden en que se muestran. */
const SIZE_ORDER = ["xs", "s", "m", "l", "xl", "xxl", "unica"];

function fold(size: string): string {
  return size.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** «unica», «Unica», «UNICA» y «única» se muestran como «Única». No cambia los datos guardados. */
export function formatSize(size: string): string {
  return fold(size) === "unica" ? "Única" : size.trim();
}

/** Opciones del filtro con las tallas que existen en el catálogo: XS, S, M, L, XL, Única y luego el resto. */
export function sizeOptions(sizes: string[]): { value: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const size of sizes) if (!seen.has(fold(size))) seen.set(fold(size), size);
  return [...seen.entries()]
    .sort(([a], [b]) => {
      const ia = SIZE_ORDER.indexOf(a);
      const ib = SIZE_ORDER.indexOf(b);
      return (ia === -1 ? SIZE_ORDER.length : ia) - (ib === -1 ? SIZE_ORDER.length : ib) || a.localeCompare(b);
    })
    .map(([, value]) => ({ value, label: formatSize(value) }));
}

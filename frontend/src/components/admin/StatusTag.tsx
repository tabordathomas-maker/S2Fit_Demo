import type { AuditTag } from "../../features/admin/api";

const TONES: Record<AuditTag["tone"], string> = {
  success: "bg-emerald-100 text-emerald-900",
  warning: "bg-amber-100 text-amber-900",
  danger: "bg-red-100 text-red-900",
  neutral: "bg-neutral-200 text-neutral-800",
};

/** Etiqueta de estado: el color acompaña al texto, nunca lo reemplaza. */
export function StatusTag({ tag }: { tag: AuditTag | null }) {
  if (!tag) return <span className="text-muted">—</span>;
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-bold ${TONES[tag.tone]}`}>{tag.label}</span>;
}

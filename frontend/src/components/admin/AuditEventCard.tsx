import type { AuditEvent } from "../../features/admin/api";

/** Un evento del registro: «Catálogo · Set Ocean», fecha y hora, quién lo hizo, qué hizo y los cambios. */
export function AuditEventCard({ event }: { event: AuditEvent }) {
  return (
    <li className="card flex flex-col gap-2 p-4 text-sm">
      <h4 className="font-display text-lg text-burgundy">{event.category} · {event.entity.name}</h4>
      <p className="text-muted">{event.when} · {event.admin}</p>
      <p>{event.admin} {event.phrase}.</p>
      {event.changes.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-2xl bg-cream p-3">
          {event.changes.map((c) => (
            <li key={c.field}><strong>{c.field}:</strong> {c.before} → {c.after}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

import { formatCOP } from "../../services/format";
import { formatPhone } from "../../services/phone";
import type { AuditClient, AuditEvent } from "../../features/admin/api";
import { StatusTag } from "./StatusTag";

function History({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) return null;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer font-bold text-burgundy">Ver historial ({events.length})</summary>
      <ul className="mt-2 flex flex-col gap-3">
        {events.map((e) => (
          <li key={e.id} className="rounded-2xl bg-white p-3">
            <p className="text-muted">{e.when} · {e.admin}</p>
            <p>{e.admin} {e.phrase}.</p>
            {e.changes.length > 0 && (
              <table className="mt-2 w-full text-left text-xs">
                <thead><tr><th className="pr-2">Campo</th><th className="pr-2">Antes</th><th>Después</th></tr></thead>
                <tbody>
                  {e.changes.map((c) => <tr key={c.field}><td className="pr-2">{c.field}</td><td className="pr-2">{c.before}</td><td>{c.after}</td></tr>)}
                </tbody>
              </table>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Una tarjeta por cliente: sus pedidos, pagos y suscripción con el estado actual, y el historial de cada referencia. */
export function ClientAuditCard({ client }: { client: AuditClient }) {
  return (
    <li className="card flex flex-col gap-4 p-5 text-sm">
      <div>
        <h3 className="font-display text-xl text-burgundy">Cliente · {client.name}</h3>
        <p className="text-xs text-muted">{[client.email, client.phone ? formatPhone(client.phone) : null].filter(Boolean).join(" · ")}</p>
      </div>
      {client.orders.map((o) => (
        <section key={o.reference} className="flex flex-col gap-1 border-t border-beige pt-3" aria-label={o.reference}>
          <p className="font-bold">{o.reference} · {formatCOP(o.total).replace(" COP", "")}</p>
          <p className="flex flex-wrap items-center gap-2">Pago · <StatusTag tag={o.payment} /></p>
          <p className="flex flex-wrap items-center gap-2">Pedido · <StatusTag tag={o.status} />{o.reserved_until && <span className="text-muted">reservado hasta {o.reserved_until}</span>}</p>
          <History events={o.events} />
        </section>
      ))}
      {client.requests.map((r) => (
        <section key={r.reference} className="flex flex-col gap-1 border-t border-beige pt-3" aria-label={r.reference}>
          <p className="font-bold">{r.reference} · {r.plan}{r.agreed_price ? ` · ${formatCOP(r.agreed_price).replace(" COP", "")}` : ""}</p>
          <p className="flex flex-wrap items-center gap-2">Pago · <StatusTag tag={r.payment} /></p>
          <p className="flex flex-wrap items-center gap-2">Solicitud · <StatusTag tag={r.status} /></p>
          <History events={r.events} />
        </section>
      ))}
      {client.subscription && (
        <section className="flex flex-col gap-1 border-t border-beige pt-3" aria-label="Suscripción">
          <p className="font-bold">{client.subscription.plan}</p>
          <p className="flex flex-wrap items-center gap-2">Suscripción · <StatusTag tag={client.subscription.status} /><span>{client.subscription.text}</span></p>
          <History events={client.subscription.events} />
        </section>
      )}
    </li>
  );
}

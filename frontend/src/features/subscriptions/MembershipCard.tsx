import { Badge, Button } from "../../components/ui";
import { formatCOP, formatDate, subscriptionStatusLabel } from "../../services/format";
import type { MembershipStatus, Subscription } from "../../services/types";

const RENEWAL_WINDOW_DAYS = 7;

/** Se ofrece renovar si la membresía venció, se canceló o vence en los próximos días. */
export function needsRenewal(sub: Subscription): boolean {
  if (sub.status !== "active" || !sub.ends_at) return true;
  const daysLeft = (new Date(sub.ends_at).getTime() - Date.now()) / 86_400_000;
  return daysLeft <= RENEWAL_WINDOW_DAYS;
}

export function MembershipCard({ status, busy, onRenew }: { status: MembershipStatus; busy?: boolean; onRenew?: (planCode: string) => void }) {
  const sub = status.subscription;
  const pending = status.pending_request;

  return (
    <div className="card flex flex-col gap-4" aria-label="Estado de tu membresía">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl">Mi membresía</h2>
        {sub && <Badge tone={status.is_active ? "burgundy" : "gray"}>{subscriptionStatusLabel[sub.status]}</Badge>}
      </div>
      {sub && (
        <dl className="grid gap-3 sm:grid-cols-3">
          <div><dt className="text-sm text-muted">Plan</dt><dd className="font-bold">{sub.plan.name}</dd></div>
          <div><dt className="text-sm text-muted">Inicio</dt><dd className="font-bold">{formatDate(sub.starts_at)}</dd></div>
          <div><dt className="text-sm text-muted">Vencimiento</dt><dd className="font-bold">{formatDate(sub.ends_at)}</dd></div>
          {sub.amount_paid && <div><dt className="text-sm text-muted">Último pago</dt><dd className="font-bold">{formatCOP(sub.amount_paid)}</dd></div>}
        </dl>
      )}
      {pending && (
        <p>
          Tienes una solicitud {pending.kind === "renewal" ? "de renovación" : ""} pendiente de pago con la referencia{" "}
          <strong className="font-mono">{pending.reference}</strong>. Tus beneficios se activan cuando verifiquemos el pago.
        </p>
      )}
      {sub && !pending && needsRenewal(sub) && onRenew && (
        <div className="flex flex-col items-start gap-2">
          <p className="muted">
            Para renovar, pulsa el botón: registraremos tu solicitud y te llevaremos a WhatsApp para acordar el pago.
          </p>
          <Button variant="dark" disabled={busy} onClick={() => onRenew(sub.plan.code)}>Renovar por WhatsApp</Button>
        </div>
      )}
      {pending && onRenew && (
        <Button className="self-start" disabled={busy} onClick={() => onRenew(pending.plan.code)}>Volver a abrir WhatsApp</Button>
      )}
    </div>
  );
}

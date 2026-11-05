import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { Alert, Badge, Button, Field, Pill, Select, Spinner, TextArea } from "../../components/ui";
import { errorMessage } from "../../services/api";
import { formatCOP, formatDateTime, formatShortDate, paymentMethodLabel, paymentStatusLabel } from "../../services/format";
import { formatPhone } from "../../services/phone";
import type { PaymentMethod, PaymentStatus } from "../../services/types";
import { useAsync } from "../../services/useAsync";
import { adminApi, type AdminPayment } from "./api";

const FILTERS: { label: string; statuses: PaymentStatus[] }[] = [
  { label: "Por verificar", statuses: ["pending", "in_review"] },
  { label: "Confirmados", statuses: ["confirmed"] },
  { label: "Rechazados / cancelados", statuses: ["rejected", "cancelled", "refunded"] },
];

const METHODS = Object.entries(paymentMethodLabel) as [PaymentMethod, string][];

export function PaymentsAdmin() {
  const [filter, setFilter] = useState(0);
  const payments = useAsync(() => adminApi.payments(FILTERS[filter].statuses), [filter]);
  // Al confirmar, el pago sale de "Por verificar": se deja a la vista con su mensaje hasta que se cambie de bandeja.
  const [confirmed, setConfirmed] = useState<AdminPayment[]>([]);
  const changeFilter = (i: number) => {
    setConfirmed([]);
    setFilter(i);
  };
  const visible = payments.data?.filter((p) => !confirmed.some((c) => c.id === p.id));

  return (
    <div className="flex flex-col gap-5">
      <Alert tone="info">
        Confirma un pago solo después de comprobar en el convenio (banco, corresponsal…) que el dinero llegó. El comprobante enviado por WhatsApp ayuda a ubicar la operación, pero no es prueba suficiente.
      </Alert>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f, i) => <Pill key={f.label} active={i === filter} onClick={() => changeFilter(i)}>{f.label}</Pill>)}
      </div>
      {payments.loading && <Spinner />}
      {payments.error && <Alert>{payments.error}</Alert>}
      {visible?.length === 0 && confirmed.length === 0 && <p className="muted">No hay pagos en esta bandeja.</p>}
      <ul className="flex flex-col gap-4">
        {confirmed.map((p) => <ConfirmedNotice key={p.id} payment={p} />)}
        {visible?.map((p) => (
          <PaymentRow key={p.id} payment={p} onChanged={payments.reload} onConfirmed={(done) => setConfirmed((prev) => [done, ...prev])} />
        ))}
      </ul>
    </div>
  );
}

function ConfirmedNotice({ payment: p }: { payment: AdminPayment }) {
  const message = p.kind === "subscription"
    ? `Pago confirmado. S2 Box de ${p.customer_name ?? p.customer_email} activa hasta ${formatShortDate(p.subscription_ends_at)}.`
    : `Pago confirmado. Pedido de ${p.customer_name ?? p.customer_email} listo para preparar.`;
  return (
    <li className="card flex flex-col gap-2 p-5">
      <span className="font-mono font-bold">{p.operation_reference}</span>
      <Alert tone="success">{message}</Alert>
      {p.kind === "subscription" && <Link className="font-bold text-burgundy underline" to="/admin?tab=s2box">Ver en S2 Box</Link>}
    </li>
  );
}

function PaymentRow({ payment: p, onChanged, onConfirmed }: {
  payment: AdminPayment; onChanged: () => Promise<void>; onConfirmed: (payment: AdminPayment) => void;
}) {
  const open = p.status === "pending" || p.status === "in_review";
  const needsTerms = p.kind === "subscription" && open && p.amount === null;
  const [mode, setMode] = useState<"none" | "confirm" | "reject" | "review" | "refund" | "terms">(needsTerms ? "terms" : "none");
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, [error]);
  const reservationExpired = p.reservation_expires_at !== null && new Date(p.reservation_expires_at) < new Date();

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      setMode("none");
      await onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const confirm = async (body: Parameters<typeof adminApi.confirmPayment>[1]) => {
    setError(null);
    try {
      const done = await adminApi.confirmPayment(p.id, body);
      onConfirmed(done);
      await onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <li className="card flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-lg font-bold">{p.operation_reference}</span>
          <Badge tone={p.kind === "order" ? "beige" : "burgundy"}>{p.kind === "order" ? "Pedido" : `S2 Box · ${p.plan_name}`}</Badge>
        </div>
        <Badge tone={p.status === "confirmed" ? "green" : open ? "beige" : "red"}>{paymentStatusLabel[p.status]}</Badge>
      </div>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-muted">Cliente</dt><dd className="font-bold">{p.customer_name ?? "—"}</dd><dd>{p.customer_email}</dd><dd>{formatPhone(p.customer_phone)}</dd></div>
        <div><dt className="text-muted">Importe acordado</dt><dd className="font-bold">{p.amount ? formatCOP(p.amount) : "Sin registrar"}</dd></div>
        <div><dt className="text-muted">Medio de pago</dt><dd>{p.method ? paymentMethodLabel[p.method] : "—"}</dd></div>
        <div><dt className="text-muted">Creado</dt><dd>{formatDateTime(p.created_at)}</dd></div>
        {p.kind === "order" && (
          <div><dt className="text-muted">Reserva</dt><dd className={reservationExpired && open ? "font-bold text-red-700" : ""}>
            {p.reservation_status === "active" ? `Hasta ${formatDateTime(p.reservation_expires_at)}` : p.reservation_status}
            {reservationExpired && open ? " (vencida: renuévala en Pedidos)" : ""}
          </dd></div>
        )}
        <div><dt className="text-muted">Ref. convenio</dt><dd className="font-mono">{p.external_reference ?? "—"}</dd></div>
        <div><dt className="text-muted">Decisión</dt><dd>{p.decided_by_email ?? "—"}</dd><dd>{formatDateTime(p.decided_at)}</dd></div>
        {p.admin_notes && <div className="sm:col-span-2"><dt className="text-muted">Observaciones</dt><dd className="whitespace-pre-line">{p.admin_notes}</dd></div>}
      </dl>

      <div className="flex flex-wrap gap-2">
        {open && <Button variant="dark" disabled={needsTerms} onClick={() => setMode("confirm")}>Confirmar pago</Button>}
        {open && p.status === "pending" && (
          <Button title="Solo marca que lo estás revisando; no activa la membresía." onClick={() => setMode("review")}>Marcar en revisión</Button>
        )}
        {open && <Button onClick={() => setMode("reject")}>Rechazar</Button>}
        {p.status === "confirmed" && <Button onClick={() => setMode("refund")}>Registrar reembolso</Button>}
      </div>
      {needsTerms && <p className="text-sm font-bold text-burgundy">Primero registra el precio acordado.</p>}
      {open && p.status === "pending" && (
        <p className="text-sm text-muted">«Marcar en revisión» solo marca que lo estás revisando; no activa la membresía ni el pedido.</p>
      )}
      {error && <div ref={errorRef}><Alert>{error}</Alert></div>}

      {mode === "terms" && p.subscription_request_id && (
        <TermsForm onCancel={() => setMode("none")} onSubmit={(price, days) => run(() => adminApi.setTerms(p.subscription_request_id!, price, days))} />
      )}
      {mode === "confirm" && <ConfirmForm payment={p} onCancel={() => setMode("none")} onSubmit={(body) => confirm(body)} />}
      {mode === "review" && (
        <NotesForm label="Notas de revisión" withMethod submitLabel="Guardar" onCancel={() => setMode("none")}
          onSubmit={(notes, method) => run(() => adminApi.reviewPayment(p.id, { admin_notes: notes || undefined, method }))} />
      )}
      {mode === "reject" && (
        <NotesForm label="Motivo del rechazo" required submitLabel="Rechazar pago" onCancel={() => setMode("none")}
          onSubmit={(notes) => run(() => adminApi.rejectPayment(p.id, notes))} />
      )}
      {mode === "refund" && (
        <NotesForm label="Detalle del reembolso" required submitLabel="Registrar reembolso" onCancel={() => setMode("none")}
          onSubmit={(notes) => run(() => adminApi.refundPayment(p.id, notes))} />
      )}
    </li>
  );
}

function TermsForm({ onSubmit, onCancel }: { onSubmit: (price: number, days: number) => void; onCancel: () => void }) {
  const [price, setPrice] = useState("");
  const [days, setDays] = useState("30");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(Number(price), Number(days));
  };
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-2xl bg-cream p-4 sm:grid-cols-3 sm:items-end">
      <Field label="Precio acordado (COP)" id="terms-price" type="number" min={1} required value={price} onChange={(e) => setPrice(e.target.value)} />
      <Field label="Vigencia (días)" id="terms-days" type="number" min={1} required value={days} onChange={(e) => setDays(e.target.value)} />
      <div className="flex gap-2"><Button type="submit" variant="dark">Guardar</Button><Button onClick={onCancel}>Cancelar</Button></div>
    </form>
  );
}

function ConfirmForm({ payment, onSubmit, onCancel }: {
  payment: AdminPayment;
  onSubmit: (body: { operation_reference: string; amount: number; method: PaymentMethod; external_reference: string; admin_notes?: string }) => void;
  onCancel: () => void;
}) {
  const [reference, setReference] = useState(payment.operation_reference);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>(payment.method ?? "transfer");
  const [external, setExternal] = useState("");
  const [notes, setNotes] = useState("");
  const [checked, setChecked] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ operation_reference: reference.trim(), amount: Number(amount), method, external_reference: external.trim(), admin_notes: notes || undefined });
  };

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-2xl bg-cream p-4 sm:grid-cols-2">
      <Field label="Referencia de la operación" id={`ref-${payment.id}`} required value={reference} onChange={(e) => setReference(e.target.value)} />
      <Field label="Importe recibido (COP)" id={`amount-${payment.id}`} type="number" min={1} required value={amount} onChange={(e) => setAmount(e.target.value)}
        hint={payment.amount ? `Debe coincidir con ${formatCOP(payment.amount)}` : undefined} />
      <Select label="Medio de pago" id={`method-${payment.id}`} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
        {METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </Select>
      <Field label="Referencia en el convenio" id={`ext-${payment.id}`} required minLength={3} value={external} onChange={(e) => setExternal(e.target.value)}
        hint="Número de transacción o comprobante del banco/convenio." />
      <div className="sm:col-span-2"><TextArea label="Observaciones" id={`notes-${payment.id}`} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <label className="flex items-start gap-2 text-sm sm:col-span-2">
        <input type="checkbox" required checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-1 h-4 w-4 accent-burgundy" />
        Verifiqué en el convenio que el dinero fue recibido.
      </label>
      <div className="flex gap-2 sm:col-span-2"><Button type="submit" variant="dark">Confirmar pago</Button><Button onClick={onCancel}>Cancelar</Button></div>
    </form>
  );
}

function NotesForm({ label, required, withMethod, submitLabel, onSubmit, onCancel }: {
  label: string; required?: boolean; withMethod?: boolean; submitLabel: string;
  onSubmit: (notes: string, method?: PaymentMethod) => void; onCancel: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [method, setMethod] = useState<PaymentMethod | "">("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(notes.trim(), method || undefined); }} className="flex flex-col gap-3 rounded-2xl bg-cream p-4">
      {withMethod && (
        <Select label="Medio de pago informado" id="notes-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          <option value="">Sin especificar</option>
          {METHODS.map(([value, l]) => <option key={value} value={value}>{l}</option>)}
        </Select>
      )}
      <TextArea label={label} id="notes-text" required={required} minLength={required ? 3 : undefined} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="flex gap-2"><Button type="submit" variant="dark">{submitLabel}</Button><Button onClick={onCancel}>Cancelar</Button></div>
    </form>
  );
}

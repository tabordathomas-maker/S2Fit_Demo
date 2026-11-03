import { useState, type FormEvent } from "react";

import { Alert, Badge, Button, Field, Spinner, TextArea } from "../../components/ui";
import { errorMessage } from "../../services/api";
import { formatCOP, formatDate, formatDateTime, paymentStatusLabel, subscriptionStatusLabel } from "../../services/format";
import type { Plan } from "../../services/types";
import { useAsync } from "../../services/useAsync";
import { adminApi } from "./api";
import { ManualMembership } from "./ManualMembership";

export function MembershipsAdmin() {
  const plans = useAsync(() => adminApi.plans(), []);
  const requests = useAsync(() => adminApi.subscriptionRequests("pending_payment"), []);
  const subs = useAsync(() => adminApi.subscriptions(), []);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await Promise.all([plans.reload(), requests.reload(), subs.reload()]);
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    }
  };

  const cancel = (id: string) => {
    const reason = window.prompt("Motivo de la cancelación:");
    if (reason && reason.trim().length >= 3) void run(() => adminApi.cancelSubscription(id, reason.trim()));
  };

  return (
    <div className="flex flex-col gap-8">
      {error && <Alert>{error}</Alert>}

      <ManualMembership plans={plans.data} onChanged={() => void subs.reload()} />

      <section className="flex flex-col gap-4">
        <h3 className="text-2xl">Planes</h3>
        {plans.loading && <Spinner />}
        <div className="grid gap-4 lg:grid-cols-2">
          {plans.data?.map((p) => <PlanEditor key={p.id} plan={p} run={run} />)}
          <NewPlanForm run={run} />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="text-2xl">Solicitudes pendientes</h3>
        <p className="muted text-sm">Registra el precio y la vigencia acordados desde la bandeja de Pagos, y confirma allí el pago cuando lo verifiques.</p>
        {requests.data?.length === 0 && <p className="muted">No hay solicitudes pendientes.</p>}
        <ul className="flex flex-col gap-2">
          {requests.data?.map((r) => (
            <li key={r.id} className="card flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
              <span className="font-mono font-bold">{r.reference}</span>
              <span>{r.customer_name ?? "—"} · {r.customer_email}</span>
              <span>{r.plan.name} · {r.kind === "renewal" ? "Renovación" : "Nueva"}</span>
              <span>{r.agreed_price ? `${formatCOP(r.agreed_price)} / ${r.agreed_duration_days} días` : "Sin precio acordado"}</span>
              <span>Pago: {r.payment_status ? paymentStatusLabel[r.payment_status] : "—"}</span>
              <span className="text-muted">{formatDateTime(r.created_at)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="text-2xl">Membresías</h3>
        {subs.loading && <Spinner />}
        <ul className="flex flex-col gap-2">
          {subs.data?.map((s) => (
            <li key={s.id} className="card flex flex-col gap-2 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">{s.customer_name ?? "—"} · {s.customer_email}</span>
                <Badge tone={s.status === "active" ? "burgundy" : "gray"}>{subscriptionStatusLabel[s.status]}</Badge>
              </div>
              <span>{s.plan.name} · {formatDate(s.starts_at)} → {formatDate(s.ends_at)} · Último pago {s.amount_paid ? formatCOP(s.amount_paid) : "—"} ({s.last_payment_reference ?? "—"})</span>
              {s.renewals.length > 0 && (
                <details>
                  <summary className="cursor-pointer font-bold">Historial ({s.renewals.length})</summary>
                  <ul className="mt-1">
                    {s.renewals.map((r) => <li key={r.created_at}>{formatDate(r.period_start)} → {formatDate(r.period_end)} · {formatCOP(r.amount)}</li>)}
                  </ul>
                </details>
              )}
              {s.status !== "cancelled" && s.status !== "pending_payment" && (
                <Button className="self-start" onClick={() => cancel(s.id)}>Cancelar membresía</Button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function benefitsFrom(text: string): string[] {
  return text.split("\n").map((b) => b.trim()).filter(Boolean);
}

function PlanEditor({ plan, run }: { plan: Plan; run: (fn: () => Promise<unknown>) => Promise<boolean> }) {
  const [form, setForm] = useState({
    name: plan.name,
    price: plan.price ? String(plan.price) : "",
    duration_days: String(plan.duration_days),
    period_label: plan.period_label,
    description: plan.description ?? "",
    benefits: plan.benefits.join("\n"),
  });
  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(() =>
      adminApi.updatePlan(plan.id, {
        name: form.name,
        ...(form.price ? { price: Number(form.price) } : { clear_price: true }),
        duration_days: Number(form.duration_days),
        period_label: form.period_label,
        description: form.description || null,
        benefits: benefitsFrom(form.benefits),
      }),
    );
  };
  return (
    <form onSubmit={save} className="card flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm">{plan.code}</span>
        <Badge tone={plan.is_active ? "green" : "red"}>{plan.is_active ? "Activo" : "Inactivo"}</Badge>
      </div>
      <Field label="Nombre" id={`pn-${plan.id}`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <Field label="Precio (COP)" id={`pp-${plan.id}`} type="number" min={1} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })}
        hint="Déjalo vacío para mostrar «Consulta el precio por WhatsApp»." />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Vigencia (días)" id={`pd-${plan.id}`} type="number" min={1} value={form.duration_days} onChange={(e) => setForm({ ...form, duration_days: e.target.value })} />
        <Field label="Periodicidad" id={`pl-${plan.id}`} value={form.period_label} onChange={(e) => setForm({ ...form, period_label: e.target.value })} />
      </div>
      <TextArea label="Descripción" id={`pdesc-${plan.id}`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <TextArea label="Beneficios (uno por línea)" id={`pb-${plan.id}`} value={form.benefits} onChange={(e) => setForm({ ...form, benefits: e.target.value })} />
      <div className="flex gap-2">
        <Button type="submit" variant="dark">Guardar plan</Button>
        <Button onClick={() => void run(() => adminApi.updatePlan(plan.id, { is_active: !plan.is_active }))}>{plan.is_active ? "Desactivar" : "Activar"}</Button>
      </div>
    </form>
  );
}

function NewPlanForm({ run }: { run: (fn: () => Promise<unknown>) => Promise<boolean> }) {
  const [form, setForm] = useState({ code: "", name: "", duration_days: "30" });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await run(() => adminApi.createPlan({ code: form.code, name: form.name, duration_days: Number(form.duration_days) }));
    if (ok) setForm({ code: "", name: "", duration_days: "30" });
  };
  return (
    <form onSubmit={submit} className="card flex flex-col gap-3 border-2 border-dashed border-beige">
      <h4 className="font-display text-lg">Nuevo plan</h4>
      <Field label="Código" id="np-code" required pattern="[a-z0-9-]{2,40}" placeholder="plus-trimestral" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
      <Field label="Nombre" id="np-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <Field label="Vigencia (días)" id="np-days" type="number" min={1} value={form.duration_days} onChange={(e) => setForm({ ...form, duration_days: e.target.value })} />
      <Button type="submit" variant="dark" className="self-start">Crear plan</Button>
    </form>
  );
}

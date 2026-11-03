import { useEffect, useRef, useState, type FormEvent } from "react";

import { Alert, Badge, Button, Field, Pill, Spinner, TextArea } from "../../components/ui";
import { errorMessage } from "../../services/api";
import { formatCOP, formatDate, formatDateTime, paymentStatusLabel, plusStatusText, subscriptionStatusLabel } from "../../services/format";
import { formatPhone } from "../../services/phone";
import type { Plan } from "../../services/types";
import { useAsync } from "../../services/useAsync";
import { adminApi, type AdminSubscription } from "./api";
import { ManualMembership } from "./ManualMembership";

const DAY_MS = 24 * 60 * 60 * 1000;

type SubFilter = "active" | "expiring" | "expired" | "cancelled" | "all";
const SUB_FILTERS: { id: SubFilter; label: string }[] = [
  { id: "active", label: "Activas" },
  { id: "expiring", label: "Por vencer en 7 días" },
  { id: "expired", label: "Vencidas" },
  { id: "cancelled", label: "Canceladas" },
  { id: "all", label: "Todas" },
];

function daysLeft(endsAt: string | null): number | null {
  return endsAt ? Math.ceil((new Date(endsAt).getTime() - Date.now()) / DAY_MS) : null;
}

function matchesFilter(s: AdminSubscription, filter: SubFilter): boolean {
  if (filter === "all") return true;
  if (filter === "expiring") {
    const left = daysLeft(s.ends_at);
    return s.status === "active" && left !== null && left <= 7;
  }
  return s.status === filter;
}

function expiryText(left: number): string {
  if (left <= 0) return "vence en menos de 1 día";
  return left === 1 ? "vence en 1 día" : `vence en ${left} días`;
}

export function MembershipsAdmin() {
  const plans = useAsync(() => adminApi.plans(), []);
  const requests = useAsync(() => adminApi.subscriptionRequests("pending_payment"), []);
  const subs = useAsync(() => adminApi.subscriptions(), []);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<SubFilter>("active");
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const reloadAll = () => Promise.all([plans.reload(), requests.reload(), subs.reload()]);

  // Un pago confirmado en la pestaña Pagos no avisa a esta pantalla: se recarga al volver a verla.
  const reloadRef = useRef(reloadAll);
  reloadRef.current = reloadAll;
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void reloadRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await reloadAll();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    }
  };

  const startCancel = (id: string) => {
    setCancelling(id);
    setReason("");
    setError(null);
  };

  const confirmCancel = async (id: string) => {
    if (reason.trim().length < 3) return setError("Escribe el motivo de la cancelación (mínimo 3 letras).");
    if (await run(() => adminApi.cancelSubscription(id, reason.trim()))) setCancelling(null);
  };

  const activeCount = subs.data?.filter((s) => s.status === "active").length ?? 0;
  const shown = subs.data?.filter((s) => matchesFilter(s, filter));

  return (
    <div className="flex flex-col gap-8">
      {error && <Alert>{error}</Alert>}

      <section className="flex flex-col gap-4" aria-label="Membresías">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-2xl">Membresías activas ({activeCount})</h3>
          <Button onClick={() => void reloadAll()} disabled={subs.loading}>Actualizar</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {SUB_FILTERS.map((f) => <Pill key={f.id} active={f.id === filter} onClick={() => setFilter(f.id)}>{f.label}</Pill>)}
        </div>
        {subs.loading && <Spinner />}
        {subs.error && <Alert>{subs.error}</Alert>}
        {shown?.length === 0 && <p className="muted">No hay membresías en este filtro.</p>}
        <ul className="flex flex-col gap-2">
          {shown?.map((s) => {
            const left = daysLeft(s.ends_at);
            const active = s.status === "active";
            return (
              <li key={s.id} className={`card flex flex-col gap-2 p-4 text-sm ${active ? "border-2 border-emerald-300" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold">{s.customer_name ?? "—"}</span>
                  <Badge tone={active ? "green" : "gray"}>{subscriptionStatusLabel[s.status]}</Badge>
                </div>
                <span>{s.customer_email ?? "—"}{s.customer_phone ? ` · ${formatPhone(s.customer_phone)}` : ""}</span>
                <span>{s.plan.name}</span>
                <span className="font-bold">
                  {plusStatusText(s.status, s.ends_at)}
                  {active && left !== null && left <= 7 && <span className="text-burgundy"> · {expiryText(left)}</span>}
                </span>
                <span>Último pago {s.amount_paid ? formatCOP(s.amount_paid) : "—"} · Ref. convenio {s.last_payment_reference ?? "—"}</span>
                {s.renewals.length > 0 && (
                  <details>
                    <summary className="cursor-pointer font-bold">Historial ({s.renewals.length})</summary>
                    <ul className="mt-1">
                      {s.renewals.map((r) => <li key={r.created_at}>{formatDate(r.period_start)} → {formatDate(r.period_end)} · {formatCOP(r.amount)}</li>)}
                    </ul>
                  </details>
                )}
                {s.status !== "cancelled" && s.status !== "pending_payment" && cancelling !== s.id && (
                  <Button className="self-start" onClick={() => startCancel(s.id)}>Cancelar membresía</Button>
                )}
                {cancelling === s.id && (
                  <div className="flex flex-col gap-2 rounded-2xl bg-cream p-3" role="group" aria-label="Confirmar cancelación">
                    <Field label="Motivo de la cancelación" id={`cancel-${s.id}`} value={reason} onChange={(e) => setReason(e.target.value)} />
                    <div className="flex gap-2">
                      <Button variant="dark" onClick={() => void confirmCancel(s.id)}>Sí, cancelar membresía</Button>
                      <Button onClick={() => setCancelling(null)}>Volver</Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <ManualMembership plans={plans.data} onChanged={() => void subs.reload()} />

      <section className="flex flex-col gap-4">
        <h3 className="text-2xl">Solicitudes pendientes</h3>
        <p className="muted text-sm">Cuando confirmes el pago en Pagos, la solicitud sale de aquí y la membresía aparece arriba como activa.</p>
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
        <h3 className="text-2xl">Planes</h3>
        {plans.loading && <Spinner />}
        <div className="grid gap-4 lg:grid-cols-2">
          {plans.data?.map((p) => <PlanEditor key={p.id} plan={p} run={run} />)}
          <NewPlanForm run={run} />
        </div>
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

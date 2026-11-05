import { useEffect, useRef, useState, type FormEvent } from "react";

import { DeleteDialog } from "../../components/admin/DeleteDialog";
import { diffPatch } from "../../components/admin/patch";
import { RowActions } from "../../components/admin/RowActions";
import { ShowArchivedToggle } from "../../components/admin/ShowArchivedToggle";
import { Alert, Badge, Button, Field, Pill, Spinner, TextArea } from "../../components/ui";
import { errorMessage } from "../../services/api";
import { formatCOP, formatDate, formatDateTime, paymentStatusLabel, plusStatusText, subscriptionStatusLabel } from "../../services/format";
import { formatPhone } from "../../services/phone";
import type { Plan } from "../../services/types";
import { useAsync } from "../../services/useAsync";
import { adminApi, type AdminSubscription, type AdminSubscriptionRequest } from "./api";
import { BoxGalleryAdmin } from "./BoxGalleryAdmin";
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
  const [showArchived, setShowArchived] = useState(false);
  const plans = useAsync(() => adminApi.plans(showArchived), [showArchived]);
  const requests = useAsync(() => adminApi.subscriptionRequests("pending_payment"), []);
  const subs = useAsync(() => adminApi.subscriptions(), []);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<SubFilter>("active");
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [editingSub, setEditingSub] = useState<string | null>(null);
  const [editingReq, setEditingReq] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ kind: "plan" | "request"; id: string; name: string } | null>(null);

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

  const run = async (fn: () => Promise<unknown>, success?: string) => {
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (success) setNotice(success);
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
      {notice && <Alert tone="success">{notice}</Alert>}

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
                <div className="flex flex-wrap gap-2">
                  {active && editingSub !== s.id && (
                    <Button aria-label={`Editar fechas de ${s.customer_name ?? s.customer_email}`} onClick={() => setEditingSub(s.id)}>Editar fechas</Button>
                  )}
                  {s.status !== "cancelled" && s.status !== "pending_payment" && cancelling !== s.id && (
                    <Button onClick={() => startCancel(s.id)}>Cancelar membresía</Button>
                  )}
                </div>
                {editingSub === s.id && (
                  <SubscriptionDatesForm
                    sub={s}
                    onCancel={() => setEditingSub(null)}
                    onSave={async (body) => {
                      const ok = await run(() => adminApi.updateSubscription(s.id, body), "Fechas de la membresía actualizadas.");
                      if (ok) setEditingSub(null);
                    }}
                  />
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

      <BoxGalleryAdmin />

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
              <RowActions
                name={r.reference}
                onEdit={() => setEditingReq(r.id)}
                onDelete={() => setDeleting({ kind: "request", id: r.id, name: r.reference })}
              />
              {editingReq === r.id && (
                <RequestTermsForm
                  request={r}
                  onCancel={() => setEditingReq(null)}
                  onSave={async (body) => {
                    if (await run(() => adminApi.updateSubscriptionRequest(r.id, body), "Solicitud actualizada.")) setEditingReq(null);
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      </section>

      <DeleteDialog
        target={deleting}
        noun={deleting?.kind === "plan" ? "plan" : "solicitud"}
        remove={() => (deleting!.kind === "plan" ? adminApi.deletePlan(Number(deleting!.id)) : adminApi.deleteSubscriptionRequest(deleting!.id))}
        archive={deleting?.kind === "plan" ? () => adminApi.archivePlan(Number(deleting.id)) : undefined}
        onClose={() => setDeleting(null)}
        onDone={(outcome) => {
          setNotice(outcome === "deleted" ? `«${deleting?.name}» eliminado.` : `«${deleting?.name}» archivado.`);
          setDeleting(null);
          void reloadAll();
        }}
      />

      <section className="flex flex-col gap-4">
        <h3 className="text-2xl">Planes</h3>
        <ShowArchivedToggle checked={showArchived} onChange={setShowArchived} />
        {plans.loading && <Spinner />}
        <div className="grid gap-4 lg:grid-cols-2">
          {plans.data?.map((p) => <PlanEditor key={p.id} plan={p} run={run} onDelete={() => setDeleting({ kind: "plan", id: String(p.id), name: p.name })} />)}
          <NewPlanForm run={run} />
        </div>
      </section>
    </div>
  );
}

function benefitsFrom(text: string): string[] {
  return text.split("\n").map((b) => b.trim()).filter(Boolean);
}

function PlanEditor({ plan, run, onDelete }: { plan: Plan; run: (fn: () => Promise<unknown>, success?: string) => Promise<boolean>; onDelete: () => void }) {
  const [form, setForm] = useState({
    name: plan.name,
    price: plan.price ? String(plan.price) : "",
    duration_days: String(plan.duration_days),
    period_label: plan.period_label,
    description: plan.description ?? "",
    benefits: plan.benefits.join("\n"),
    hide_price: plan.hide_price ?? false,
  });
  const save = (e: FormEvent) => {
    e.preventDefault();
    // Solo se envía lo que cambió.
    const changes = diffPatch(
      { name: plan.name, price: plan.price, duration_days: plan.duration_days, period_label: plan.period_label, description: plan.description, benefits: plan.benefits, hide_price: plan.hide_price ?? false },
      {
        name: form.name,
        price: form.price ? Number(form.price) : null,
        duration_days: Number(form.duration_days),
        period_label: form.period_label,
        description: form.description || null,
        benefits: benefitsFrom(form.benefits),
        hide_price: form.hide_price,
      },
    );
    if (Object.keys(changes).length === 0) return;
    const { price, ...rest } = changes;
    const body: Record<string, unknown> = { ...rest };
    if ("price" in changes) {
      if (price === null) body.clear_price = true;
      else body.price = price;
    }
    void run(() => adminApi.updatePlan(plan.id, body), "Plan actualizado.");
  };
  return (
    <form onSubmit={save} className="card flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm">{plan.code}</span>
        <Badge tone={plan.is_active ? "green" : "gray"}>{plan.is_active ? "Activo" : "Archivado"}</Badge>
      </div>
      <Field label="Nombre" id={`pn-${plan.id}`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <Field label="Precio (COP)" id={`pp-${plan.id}`} type="number" min={1} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })}
        hint="Déjalo vacío para mostrar «Consulta el precio por WhatsApp»." />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-burgundy" checked={form.hide_price} onChange={(e) => setForm({ ...form, hide_price: e.target.checked })} />
        <span>Ocultar el precio al público (se muestra «Precio por confirmar»). Tú lo sigues viendo aquí.</span>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Vigencia (días)" id={`pd-${plan.id}`} type="number" min={1} value={form.duration_days} onChange={(e) => setForm({ ...form, duration_days: e.target.value })} />
        <Field label="Periodicidad" id={`pl-${plan.id}`} value={form.period_label} onChange={(e) => setForm({ ...form, period_label: e.target.value })} />
      </div>
      <TextArea label="Descripción" id={`pdesc-${plan.id}`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <TextArea label="Beneficios (uno por línea)" id={`pb-${plan.id}`} value={form.benefits} onChange={(e) => setForm({ ...form, benefits: e.target.value })} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="dark">Guardar plan</Button>
        <RowActions
          name={plan.name}
          archived={!plan.is_active}
          onArchive={() => void run(() => adminApi.archivePlan(plan.id), "Plan archivado: ya no se ofrece en S2 Box.")}
          onRestore={() => void run(() => adminApi.restorePlan(plan.id), "Plan restaurado.")}
          onDelete={onDelete}
        />
      </div>
    </form>
  );
}

function RequestTermsForm({ request, onSave, onCancel }: {
  request: AdminSubscriptionRequest; onSave: (body: { agreed_price?: number; agreed_duration_days?: number }) => void; onCancel: () => void;
}) {
  const initial = { agreed_price: request.agreed_price, agreed_duration_days: request.agreed_duration_days };
  const [price, setPrice] = useState(request.agreed_price ? String(request.agreed_price) : "");
  const [days, setDays] = useState(request.agreed_duration_days ? String(request.agreed_duration_days) : "");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const changes = diffPatch(initial, { agreed_price: price ? Number(price) : null, agreed_duration_days: days ? Number(days) : null });
    if (Object.keys(changes).length === 0) return onCancel();
    onSave({
      ...(changes.agreed_price ? { agreed_price: changes.agreed_price } : {}),
      ...(changes.agreed_duration_days ? { agreed_duration_days: changes.agreed_duration_days } : {}),
    });
  };
  return (
    <form onSubmit={submit} aria-label={`Editar ${request.reference}`} className="grid w-full gap-3 rounded-2xl bg-cream p-4 sm:grid-cols-3 sm:items-end">
      <Field label="Precio acordado (COP)" id={`rq-price-${request.id}`} type="number" min={1} value={price} onChange={(e) => setPrice(e.target.value)} />
      <Field label="Vigencia acordada (días)" id={`rq-days-${request.id}`} type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} />
      <div className="flex gap-2"><Button type="submit" variant="dark">Guardar solicitud</Button><Button onClick={onCancel}>Cancelar</Button></div>
    </form>
  );
}

function SubscriptionDatesForm({ sub, onSave, onCancel }: {
  sub: AdminSubscription; onSave: (body: { starts_at?: string; ends_at?: string }) => void; onCancel: () => void;
}) {
  const [starts, setStarts] = useState(sub.starts_at?.slice(0, 10) ?? "");
  const [ends, setEnds] = useState(sub.ends_at?.slice(0, 10) ?? "");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body: { starts_at?: string; ends_at?: string } = {};
    // Se conserva la hora original; solo cambia el día.
    if (sub.starts_at && starts !== sub.starts_at.slice(0, 10)) body.starts_at = `${starts}${sub.starts_at.slice(10)}`;
    if (sub.ends_at && ends !== sub.ends_at.slice(0, 10)) body.ends_at = `${ends}${sub.ends_at.slice(10)}`;
    if (Object.keys(body).length === 0) return onCancel();
    onSave(body);
  };
  return (
    <form onSubmit={submit} aria-label="Editar fechas de la membresía" className="grid gap-3 rounded-2xl bg-cream p-4 sm:grid-cols-3 sm:items-end">
      <Field label="Inicio" id={`sd-start-${sub.id}`} type="date" required value={starts} onChange={(e) => setStarts(e.target.value)} />
      <Field label="Vence" id={`sd-end-${sub.id}`} type="date" required value={ends} onChange={(e) => setEnds(e.target.value)} />
      <div className="flex gap-2"><Button type="submit" variant="dark">Guardar fechas</Button><Button onClick={onCancel}>Cancelar</Button></div>
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

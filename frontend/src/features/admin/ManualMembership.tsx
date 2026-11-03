import { useEffect, useState } from "react";

import { Alert, Button, Field, Pill, Spinner } from "../../components/ui";
import { errorMessage } from "../../services/api";
import { formatShortDate, plusStatusText } from "../../services/format";
import { formatPhone } from "../../services/phone";
import type { AdminProfile, Plan } from "../../services/types";
import { useAsync } from "../../services/useAsync";
import { adminApi } from "./api";

const DAY_MS = 24 * 60 * 60 * 1000;
const PRESETS = [30, 90, 365];
const REASONS = ["Cortesía", "Prueba", "Pago en efectivo", "Pago por transferencia confirmado"];

type Pending = "grant" | "cancel" | null;

/** Sección "Activar S2 Plus manualmente": el backend decide las fechas; aquí solo se anticipan para mostrarlas. */
export function ManualMembership({ plans, onChanged }: { plans: Plan[] | undefined; onChanged: () => void }) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<AdminProfile | null>(null);
  const [preset, setPreset] = useState<number | "other">(30);
  const [otherDays, setOtherDays] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const people = useAsync(() => adminApi.profiles(debounced || undefined), [debounced]);
  const membership = useAsync(
    () => (selected ? adminApi.membership(selected.id) : Promise.resolve(undefined)),
    [selected?.id],
  );

  const choose = (person: AdminProfile) => {
    setSelected(person);
    setPending(null);
    setError(null);
    setSuccess(null);
    setReason("");
  };

  const days = preset === "other" ? Number(otherDays) : preset;
  const daysValid = Number.isInteger(days) && days >= 1 && days <= 3650;
  const current = membership.data;
  const isActive = current?.is_active ?? false;
  const noPlans = plans !== undefined && !plans.some((p) => p.is_active);

  const preview = (() => {
    if (!daysValid || !current) return null;
    if (isActive && current.ends_at) {
      const end = new Date(new Date(current.ends_at).getTime() + days * DAY_MS);
      return `Se extenderá desde el ${formatShortDate(current.ends_at)} hasta el ${formatShortDate(end)}.`;
    }
    const end = new Date(Date.now() + days * DAY_MS);
    return `Quedará activa desde hoy hasta el ${formatShortDate(end)}.`;
  })();

  const ask = (action: Exclude<Pending, null>) => {
    setError(null);
    setSuccess(null);
    if (reason.trim().length < 3) return setError("Escribe el motivo (mínimo 3 letras).");
    if (action === "grant" && !daysValid) return setError("Los días deben ser un número entre 1 y 3650.");
    setPending(action);
  };

  const confirm = async () => {
    if (!selected || !pending) return;
    setBusy(true);
    setError(null);
    const firstName = selected.full_name?.split(" ")[0] || selected.email || "la persona";
    try {
      const result =
        pending === "grant"
          ? await adminApi.grantMembership(selected.id, days, reason.trim())
          : await adminApi.cancelMembership(selected.id, reason.trim());
      setSuccess(
        pending === "grant"
          ? `S2 Plus activa para ${firstName} hasta el ${formatShortDate(result.ends_at)}`
          : `S2 Plus cancelada para ${firstName}`,
      );
      setPending(null);
      setReason("");
      await Promise.all([membership.reload(), people.reload()]);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
      setPending(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card flex flex-col gap-4" aria-label="Activar S2 Plus manualmente">
      <h3 className="text-2xl">Activar S2 Plus manualmente</h3>

      {noPlans ? (
        <Alert tone="info">Primero crea un plan en esta misma pestaña (sección Planes).</Alert>
      ) : (
        <>
          <Field label="Busca a una persona por nombre, correo o celular" id="plus-person-search" value={query} onChange={(e) => setQuery(e.target.value)} />
          {people.loading && <Spinner />}
          {people.error && <Alert>{people.error}</Alert>}
          {people.data?.length === 0 && <p className="muted">No encontramos a nadie con esa búsqueda.</p>}
          <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
            {people.data?.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => choose(p)}
                  aria-pressed={selected?.id === p.id}
                  className={`w-full rounded-2xl bg-cream p-3 text-left text-sm hover:ring-2 hover:ring-burgundy focus-visible:ring-2 focus-visible:ring-burgundy ${selected?.id === p.id ? "ring-2 ring-burgundy" : ""}`}
                >
                  <span className="block font-bold">{p.full_name || "Sin nombre"}</span>
                  <span className="block">{p.email}{p.phone ? ` · ${formatPhone(p.phone)}` : ""}</span>
                  <span className="block text-muted">{plusStatusText(p.plus_status, p.plus_ends_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {success && <Alert tone="success">{success}</Alert>}
      {error && <Alert>{error}</Alert>}

      {selected && !noPlans && (
        <div className="flex flex-col gap-4 rounded-2xl border-2 border-beige p-4" aria-label="Datos de la activación">
          <div>
            <p className="font-bold">{selected.full_name || selected.email}</p>
            <p className="text-sm">
              {membership.loading ? "Consultando…" : current ? plusStatusText(current.status, current.ends_at) : ""}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <span className="label">Duración</span>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((d) => (
                <Pill key={d} active={preset === d} onClick={() => setPreset(d)}>{d} días</Pill>
              ))}
              <Pill active={preset === "other"} onClick={() => setPreset("other")}>Otro</Pill>
            </div>
            {preset === "other" && (
              <Field label="Número de días (1 a 3650)" id="plus-other-days" type="number" min={1} max={3650} value={otherDays} onChange={(e) => setOtherDays(e.target.value)} />
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Field label="Motivo" id="plus-reason" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              {REASONS.map((r) => (
                <Button key={r} onClick={() => setReason(r)}>{r}</Button>
              ))}
            </div>
          </div>

          {preview && <p className="text-sm font-bold">{preview}</p>}

          {pending ? (
            <div className="flex flex-col gap-2 rounded-2xl bg-cream p-3" role="group" aria-label="Confirmación">
              <p className="text-sm">
                {pending === "grant"
                  ? `¿Confirmas ${isActive ? "extender" : "activar"} S2 Plus por ${days} días?`
                  : "¿Confirmas cancelar S2 Plus ahora mismo? La persona pierde el acceso."}
              </p>
              <div className="flex gap-2">
                <Button variant="dark" disabled={busy} onClick={() => void confirm()}>
                  {pending === "grant" ? "Sí, confirmar" : "Sí, cancelar S2 Plus"}
                </Button>
                <Button disabled={busy} onClick={() => setPending(null)}>Volver</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="dark" onClick={() => ask("grant")}>{isActive ? "Extender S2 Plus" : "Activar S2 Plus"}</Button>
              {isActive && <Button onClick={() => ask("cancel")}>Cancelar S2 Plus</Button>}
            </div>
          )}
        </div>
      )}

      <p className="muted text-xs">
        Úsalo para cortesías y pruebas. Si la clienta pagó por WhatsApp, lo ideal es confirmar su pago en la pestaña Pagos para que quede el registro del dinero.
      </p>
    </section>
  );
}

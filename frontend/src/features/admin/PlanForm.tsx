import { useState, type FormEvent, type ReactNode } from "react";

import { diffPatch } from "../../components/admin/patch";
import { Alert, Badge, Button, Field, Select, TextArea } from "../../components/ui";
import { ApiError, errorMessage } from "../../services/api";
import { normalizePlanName, slugifyCode } from "../../services/planCode";
import type { Plan } from "../../services/types";
import { planPriceLabel } from "../subscriptions/S2BoxPage";

const DURATIONS = [
  { id: "mensual", label: "Mensual", days: 30 },
  { id: "trimestral", label: "Trimestral", days: 90 },
  { id: "semestral", label: "Semestral", days: 180 },
  { id: "anual", label: "Anual", days: 365 },
] as const;

const dots = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

function presetOf(plan?: Plan): string {
  const found = plan ? DURATIONS.find((d) => d.days === plan.duration_days && d.id === plan.period_label.toLowerCase()) : DURATIONS[0];
  return found?.id ?? "otro";
}

interface PlanFormProps {
  mode: "create" | "edit";
  plan?: Plan;
  /** Con historial (solicitudes o suscripciones) el código no se puede cambiar. */
  codeLocked?: boolean;
  /** Debe lanzar el error si falla; el formulario muestra los mensajes del backend junto al campo. */
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
  onCancel?: () => void;
  /** Acciones extra de la tarjeta (archivar, eliminar…). */
  actions?: ReactNode;
}

/** Crea o edita un plan de S2 Box. El código se genera solo a partir del nombre mientras no se edite a mano. */
export function PlanForm({ mode, plan, codeLocked = false, onSubmit, onCancel, actions }: PlanFormProps) {
  const idKey = plan ? String(plan.id) : "new";
  const [name, setName] = useState(plan?.name ?? "");
  const [code, setCode] = useState(plan?.code ?? "");
  const [codeTouched, setCodeTouched] = useState(mode === "edit");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [price, setPrice] = useState(plan?.price ? String(plan.price) : "");
  const [hidePrice, setHidePrice] = useState(plan?.hide_price ?? false);
  const [preset, setPreset] = useState(presetOf(plan));
  const [customDays, setCustomDays] = useState(String(plan?.duration_days ?? 30));
  const [customLabel, setCustomLabel] = useState(plan?.period_label ?? "");
  const [benefits, setBenefits] = useState<string[]>(plan?.benefits ?? []);
  const [isActive, setIsActive] = useState(plan?.is_active ?? true);
  const [sortOrder, setSortOrder] = useState(String(plan?.sort_order ?? 0));
  const [errors, setErrors] = useState<{ name?: string; code?: string; general?: string }>({});
  const [saving, setSaving] = useState(false);

  const normalizedName = normalizePlanName(name);
  const shownCode = codeTouched ? code : slugifyCode(normalizedName);
  const durationDays = preset === "otro" ? Number(customDays) || 0 : DURATIONS.find((d) => d.id === preset)!.days;
  const periodLabel = preset === "otro" ? customLabel.trim() : preset;
  const cleanBenefits = benefits.map((b) => b.trim()).filter(Boolean);

  const setBenefit = (i: number, value: string) => setBenefits((all) => all.map((b, j) => (j === i ? value : b)));
  const moveBenefit = (i: number, delta: -1 | 1) =>
    setBenefits((all) => {
      const next = [...all];
      [next[i], next[i + delta]] = [next[i + delta], next[i]];
      return next;
    });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const current = {
      name: normalizedName,
      description: description.trim() || null,
      price: price ? Number(price) : null,
      hide_price: hidePrice,
      duration_days: durationDays,
      period_label: periodLabel,
      benefits: cleanBenefits,
      is_active: isActive,
      sort_order: Number(sortOrder) || 0,
    };
    let body: Record<string, unknown>;
    if (mode === "create") {
      body = { ...current, ...(codeTouched && code ? { code } : {}) };
    } else {
      // Solo se envía lo que cambió.
      const changes = diffPatch(
        { name: plan!.name, description: plan!.description, price: plan!.price, hide_price: plan!.hide_price ?? false, duration_days: plan!.duration_days,
          period_label: plan!.period_label, benefits: plan!.benefits, is_active: plan!.is_active, sort_order: plan!.sort_order ?? 0 },
        current,
      );
      const { price: newPrice, ...rest } = changes;
      body = { ...rest };
      if ("price" in changes) {
        if (newPrice === null) body.clear_price = true;
        else body.price = newPrice;
      }
      if (!codeLocked && code !== plan!.code) body.code = code;
      if (Object.keys(body).length === 0) return;
    }
    setSaving(true);
    setErrors({});
    try {
      await onSubmit(body);
      if (mode === "create") {
        setName(""); setCode(""); setCodeTouched(false); setDescription(""); setPrice(""); setHidePrice(false);
        setPreset("mensual"); setBenefits([]); setIsActive(true); setSortOrder("0");
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === "PLAN_NAME_TAKEN") setErrors({ name: err.message });
      else if (err instanceof ApiError && (err.code === "PLAN_CODE_TAKEN" || err.code === "PLAN_CODE_LOCKED")) setErrors({ code: err.message });
      else if (err instanceof ApiError && err.status === 422) {
        const fields = (err.details.fields as { field: string; message: string }[] | undefined) ?? [];
        setErrors({
          name: fields.find((f) => f.field === "name")?.message,
          code: fields.find((f) => f.field === "code")?.message,
          general: fields.some((f) => f.field !== "name" && f.field !== "code") ? err.message : undefined,
        });
      } else setErrors({ general: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const preview: Plan = {
    id: 0, code: shownCode, name: normalizedName || "Nombre del plan", description: description.trim() || null,
    price: price ? Number(price) : null, hide_price: hidePrice, duration_days: durationDays, period_label: periodLabel || "mensual",
    benefits: cleanBenefits, is_active: isActive,
  };

  return (
    <form onSubmit={submit} aria-label={mode === "create" ? "Nuevo plan" : `Plan ${plan?.name}`} className="card flex flex-col gap-3">
      {mode === "create" && <h4 className="font-display text-lg">Nuevo plan</h4>}
      {mode === "edit" && plan && (
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-sm">{plan.code}</span>
          <Badge tone={plan.is_active ? "green" : "gray"}>{plan.deleted_at ? "Eliminado" : plan.is_active ? "Activo" : "Archivado"}</Badge>
        </div>
      )}
      <div>
        <Field label="Nombre" id={`pn-${idKey}`} required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name}
          hint={`${normalizedName.length}/80 · Así lo verán las clientas en S2 Box y en el mensaje de WhatsApp.`} />
        {errors.name && <p role="alert" className="mt-1 text-sm font-bold text-red-700">{errors.name}</p>}
      </div>
      <div>
        <Field label="Código" id={`pc-${idKey}`} value={shownCode} disabled={codeLocked} aria-invalid={!!errors.code}
          onChange={(e) => { setCodeTouched(true); setCode(e.target.value); }}
          hint={codeLocked ? "El código no se puede cambiar porque el plan ya tiene historial." : "Se usa internamente; solo minúsculas, números y guiones."} />
        <p className="mt-1 text-sm text-muted">Código: <strong className="font-mono">{shownCode}</strong></p>
        {errors.code && <p role="alert" className="mt-1 text-sm font-bold text-red-700">{errors.code}</p>}
      </div>
      <div>
        <TextArea label="Descripción" id={`pdesc-${idKey}`} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
        <p className="text-sm text-muted">{description.length}/1000</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Precio (COP)" id={`pp-${idKey}`} inputMode="numeric" placeholder="Precio por definir" value={dots(price)}
          onChange={(e) => setPrice(e.target.value.replace(/\D/g, "").replace(/^0+/, ""))}
          hint="Vacío = «Precio por definir»." />
        <label className="flex items-start gap-2 text-sm sm:mt-7">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-burgundy" checked={hidePrice} onChange={(e) => setHidePrice(e.target.checked)} />
          <span>Ocultar el precio al público (se muestra «Precio por confirmar»). Tú lo sigues viendo aquí.</span>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Duración" id={`pd-${idKey}`} value={preset} onChange={(e) => setPreset(e.target.value)}>
          {DURATIONS.map((d) => <option key={d.id} value={d.id}>{d.label} ({d.days} días)</option>)}
          <option value="otro">Otro</option>
        </Select>
        {preset === "otro" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Días" id={`pdays-${idKey}`} type="number" min={1} max={3650} value={customDays} onChange={(e) => setCustomDays(e.target.value)} />
            <Field label="Periodicidad" id={`pl-${idKey}`} maxLength={40} placeholder="bimestral" value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} />
          </div>
        )}
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="label">Beneficios</legend>
        {benefits.map((b, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input className="input min-w-[200px] flex-1" aria-label={`Beneficio ${i + 1}`} maxLength={120} value={b} onChange={(e) => setBenefit(i, e.target.value)} />
            <Button aria-label={`Subir beneficio ${i + 1}`} disabled={i === 0} onClick={() => moveBenefit(i, -1)}>↑</Button>
            <Button aria-label={`Bajar beneficio ${i + 1}`} disabled={i === benefits.length - 1} onClick={() => moveBenefit(i, 1)}>↓</Button>
            <Button aria-label={`Quitar beneficio ${i + 1}`} onClick={() => setBenefits((all) => all.filter((_, j) => j !== i))}>Quitar</Button>
          </div>
        ))}
        <Button className="self-start" disabled={benefits.length >= 12} onClick={() => setBenefits((all) => [...all, ""])}>Agregar beneficio</Button>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" className="h-4 w-4 accent-burgundy" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Visible en S2 Box
        </label>
        <Field label="Orden" id={`po-${idKey}`} type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
      </div>

      <div className="rounded-2xl bg-cream p-4" aria-label="Vista previa de la tarjeta del plan">
        <p className="mb-2 text-sm font-bold text-muted">Así se verá en S2 Box</p>
        <article className="card flex flex-col gap-2 bg-white">
          <h5 className="text-xl">{preview.name}</h5>
          {preview.description && <p className="muted">{preview.description}</p>}
          <p className="font-bold text-burgundy">{planPriceLabel(preview)}</p>
          <p className="text-sm text-muted">Vigencia: {preview.duration_days} días · renovación manual</p>
          <ul className="list-inside list-disc text-sm">{preview.benefits.map((b) => <li key={b}>{b}</li>)}</ul>
        </article>
      </div>

      {errors.general && <Alert>{errors.general}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="dark" disabled={saving}>{mode === "create" ? "Crear plan" : "Guardar plan"}</Button>
        {onCancel && <Button onClick={onCancel}>Cancelar</Button>}
        {actions}
      </div>
    </form>
  );
}

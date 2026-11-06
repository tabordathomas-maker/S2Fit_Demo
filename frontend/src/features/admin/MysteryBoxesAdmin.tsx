import { useState, type FormEvent } from "react";

import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { RowActions } from "../../components/admin/RowActions";
import { useNotice } from "../../components/admin/useNotice";
import { FileUploadButton, IMAGE_ACCEPT, IMAGE_HINT } from "../../components/FileUploadButton";
import { Alert, Badge, Button, Field, Select, Spinner, TextArea } from "../../components/ui";
import { S2BOX_BOXES } from "../../content/s2box";
import { formatDateTime } from "../../services/format";
import { formatPhone } from "../../services/phone";
import { useAsync } from "../../services/useAsync";
import { ProductImage } from "../catalog/ProductImage";
import { MediaPlayer } from "../content/ContentGrid";
import {
  s2boxAdminApi,
  type AdminBoxClaim,
  type AdminMysteryBox,
  type BoxAccess,
  type ClaimStatus,
  type MysteryBoxInput,
} from "../s2box/api";

const MEDIA_ACCEPT = "video/mp4,video/webm,video/quicktime,image/jpeg,image/png,image/webp";
const COVER_ADVICE = "Recomendado: foto vertical 4:5 (1080 × 1350 px), caja centrada.";

interface FormState {
  title: string;
  teaser: string;
  cover_url: string;
  cover_alt: string;
  content_access: BoxAccess;
  content_media_url: string;
  content_description: string;
  is_active: boolean;
  sort_order: string;
}

const EMPTY: FormState = {
  title: "", teaser: "", cover_url: "", cover_alt: "", content_access: "plus", content_media_url: "",
  content_description: "", is_active: true, sort_order: "0",
};

function toForm(box: AdminMysteryBox): FormState {
  return {
    title: box.title, teaser: box.teaser ?? "", cover_url: box.cover_url, cover_alt: box.cover_alt ?? "",
    content_access: box.content_access, content_media_url: box.content_media_url ?? "",
    content_description: box.content_description, is_active: box.is_active, sort_order: String(box.sort_order),
  };
}

function toInput(form: FormState): MysteryBoxInput {
  return {
    title: form.title.trim(),
    teaser: form.teaser.trim() || null,
    cover_url: form.cover_url,
    cover_alt: form.cover_alt.trim() || null,
    content_media_url: form.content_media_url.trim() || null,
    content_description: form.content_description.trim(),
    content_access: form.content_access,
    is_active: form.is_active,
    sort_order: Math.max(0, Number(form.sort_order) || 0),
  };
}

/** Pestaña «Cajas S2 Box»: CRUD de cajas (portada pública + contenido protegido) y sus reclamos. */
export function MysteryBoxesAdmin() {
  const boxes = useAsync(() => s2boxAdminApi.boxes(), []);
  const { notice, success, fail, clear } = useNotice();
  const [editing, setEditing] = useState<AdminMysteryBox | "new" | null>(null);
  const [deleting, setDeleting] = useState<AdminMysteryBox | null>(null);
  const [removing, setRemoving] = useState(false);
  const list = boxes.data ?? [];

  const remove = async () => {
    if (!deleting) return;
    setRemoving(true);
    try {
      await s2boxAdminApi.removeBox(deleting.id);
      success(`Caja «${deleting.title}» eliminada.`);
      setDeleting(null);
      await boxes.reload();
    } catch (err) {
      fail(err);
      setDeleting(null);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4" aria-label="Cajas S2 Box">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-2xl">Cajas S2 Box</h3>
          {editing === null && <Button variant="dark" onClick={() => { clear(); setEditing("new"); }}>Nueva caja</Button>}
        </div>
        {notice}
        {editing !== null && (
          <BoxForm
            key={editing === "new" ? "new" : editing.id}
            box={editing === "new" ? null : editing}
            onCancel={() => setEditing(null)}
            onSaved={async (text) => {
              success(text);
              setEditing(null);
              await boxes.reload();
            }}
            onError={fail}
          />
        )}
        {boxes.error && <Alert>{boxes.error}</Alert>}
        {boxes.loading && !boxes.data && <Spinner />}
        {boxes.data && list.length === 0 && <p className="muted">Aún no hay cajas. Crea la primera con «Nueva caja».</p>}
        <ul className="flex flex-col gap-3">
          {list.map((box) => (
            <li key={box.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <ProductImage src={box.cover_url} alt={box.cover_alt || box.title} className="w-20 shrink-0 rounded-xl" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="font-display text-lg">{box.title}</p>
                {box.teaser && <p className="text-sm text-muted">{box.teaser}</p>}
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone={box.content_access === "plus" ? "burgundy" : "green"}>
                    {box.content_access === "plus" ? S2BOX_BOXES.badgePlus : S2BOX_BOXES.badgeFree}
                  </Badge>
                  <Badge tone={box.is_active ? "green" : "gray"}>{box.is_active ? "Activa" : "Inactiva"}</Badge>
                  <span>Orden: <strong>{box.sort_order}</strong></span>
                </div>
              </div>
              <RowActions name={box.title} onEdit={() => { clear(); setEditing(box); }} onDelete={() => { clear(); setDeleting(box); }} />
            </li>
          ))}
        </ul>
      </section>

      <ClaimsSection onNotice={success} onError={fail} />

      <ConfirmDialog
        open={deleting !== null}
        title="Eliminar caja"
        message={
          <p>
            ¿Eliminar la caja «{deleting?.title}»? Si ya tiene reclamos se oculta y el historial se conserva;
            si no, se borra para siempre.
          </p>
        }
        confirmLabel="Sí, eliminar"
        busy={removing}
        onConfirm={() => void remove()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function BoxForm({ box, onCancel, onSaved, onError }: {
  box: AdminMysteryBox | null;
  onCancel: () => void;
  onSaved: (text: string) => Promise<void>;
  onError: (err: unknown) => void;
}) {
  const [form, setForm] = useState<FormState>(box ? toForm(box) : EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"cover" | "media" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const upload = async (kind: "cover" | "media", file: File) => {
    setUploading(kind);
    setProblem(null);
    try {
      if (kind === "cover") set("cover_url", (await s2boxAdminApi.upload(file)).url);
      else set("content_media_url", (await s2boxAdminApi.uploadMedia(file)).url);
    } catch (err) {
      onError(err);
    } finally {
      setUploading(null);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.cover_url) {
      setProblem("Sube la imagen de portada antes de guardar.");
      return;
    }
    setSaving(true);
    setProblem(null);
    try {
      if (box) await s2boxAdminApi.updateBox(box.id, toInput(form));
      else await s2boxAdminApi.createBox(toInput(form));
      await onSaved(box ? "Caja actualizada." : "Caja creada.");
    } catch (err) {
      onError(err);
    } finally {
      setSaving(false);
    }
  };

  const id = box ? `box-${box.id}` : "box-new";
  return (
    <form onSubmit={submit} className="card flex flex-col gap-6" aria-label={box ? `Editar ${box.title}` : "Nueva caja"}>
      <fieldset className="flex flex-col gap-3 rounded-2xl bg-cream p-4">
        <legend className="px-2 font-display text-lg">Portada (visible para todos)</legend>
        <Field label="Título" id={`${id}-title`} required minLength={2} maxLength={120} value={form.title} onChange={(e) => set("title", e.target.value)} />
        <TextArea label="Texto corto" id={`${id}-teaser`} maxLength={300} value={form.teaser} onChange={(e) => set("teaser", e.target.value)} />
        <div className="flex flex-wrap items-start gap-4">
          {form.cover_url && <ProductImage src={form.cover_url} alt={form.cover_alt || "Vista previa de la portada"} className="w-24 rounded-xl" />}
          <FileUploadButton
            id={`${id}-cover`} label={form.cover_url ? "Cambiar portada" : "Subir portada"} accept={IMAGE_ACCEPT}
            hint={IMAGE_HINT} busy={uploading === "cover"} onFile={(f) => void upload("cover", f)}
          />
        </div>
        <p className="text-sm text-muted">{COVER_ADVICE}</p>
        <Field label="Texto alternativo de la imagen" id={`${id}-alt`} maxLength={200} value={form.cover_alt} onChange={(e) => set("cover_alt", e.target.value)} />
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-2xl bg-cream p-4">
        <legend className="px-2 font-display text-lg">Contenido S2 Box</legend>
        <Select label="Acceso" id={`${id}-access`} value={form.content_access} onChange={(e) => set("content_access", e.target.value as BoxAccess)}>
          <option value="plus">Solo membresía S2 Box</option>
          <option value="free">Para todos</option>
        </Select>
        <FileUploadButton
          id={`${id}-media-file`} label={form.content_media_url ? "Cambiar imagen o video" : "Subir imagen o video"}
          accept={MEDIA_ACCEPT} hint="Imagen o video (MP4, WEBM, MOV)." busy={uploading === "media"} onFile={(f) => void upload("media", f)}
        />
        <Field
          label="O pega un enlace de YouTube o Vimeo" id={`${id}-media-url`} type="url" placeholder="https://www.youtube.com/watch?v=…"
          maxLength={1000} value={form.content_media_url} onChange={(e) => set("content_media_url", e.target.value)}
        />
        {form.content_media_url && <MediaPlayer url={form.content_media_url} title={form.title || "Vista previa del contenido"} />}
        <TextArea label="Descripción" id={`${id}-desc`} required maxLength={20000} value={form.content_description} onChange={(e) => set("content_description", e.target.value)} />
      </fieldset>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex min-h-11 items-center gap-2 font-bold">
          <input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} />
          Caja activa
        </label>
        <div className="w-32">
          <Field label="Orden" id={`${id}-order`} type="number" min={0} value={form.sort_order} onChange={(e) => set("sort_order", e.target.value)} />
        </div>
      </div>
      {problem && <Alert>{problem}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="dark" disabled={saving || uploading !== null}>
          {saving ? "Guardando…" : box ? "Guardar cambios" : "Crear caja"}
        </Button>
        <Button type="button" onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  );
}

const FILTERS: { value: ClaimStatus | "all"; label: string }[] = [
  { value: "pending", label: "Pendientes" },
  { value: "accepted", label: "Aceptados" },
  { value: "rejected", label: "Rechazados" },
  { value: "all", label: "Todos" },
];
const STATUS_LABEL: Record<ClaimStatus, { label: string; tone: "beige" | "green" | "burgundy" }> = {
  pending: { label: "Pendiente", tone: "beige" },
  accepted: { label: "Aceptado", tone: "green" },
  rejected: { label: "Rechazado", tone: "burgundy" },
};

function ClaimsSection({ onNotice, onError }: { onNotice: (text: string) => void; onError: (err: unknown) => void }) {
  const [filter, setFilter] = useState<ClaimStatus | "all">("pending");
  const claims = useAsync(() => s2boxAdminApi.claims(filter === "all" ? undefined : filter), [filter]);
  const list = claims.data ?? [];

  return (
    <section className="flex flex-col gap-4" aria-label="Reclamos de S2 Box">
      <h3 className="text-2xl">Reclamos de S2 Box</h3>
      <Select label="Mostrar" id="claims-filter" value={filter} onChange={(e) => setFilter(e.target.value as ClaimStatus | "all")}>
        {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
      </Select>
      {claims.error && <Alert>{claims.error}</Alert>}
      {claims.loading && !claims.data && <Spinner />}
      {claims.data && list.length === 0 && <p className="muted">No hay reclamos en esta lista.</p>}
      <ul className="flex flex-col gap-3">
        {list.map((claim) => (
          <ClaimRow key={claim.id} claim={claim} onDone={async (text) => { onNotice(text); await claims.reload(); }} onError={onError} />
        ))}
      </ul>
    </section>
  );
}

function ClaimRow({ claim, onDone, onError }: {
  claim: AdminBoxClaim;
  onDone: (text: string) => Promise<void>;
  onError: (err: unknown) => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const state = STATUS_LABEL[claim.status];

  const decide = async (action: "accept" | "reject") => {
    setBusy(true);
    try {
      if (action === "accept") await s2boxAdminApi.acceptClaim(claim.id, note.trim());
      else await s2boxAdminApi.rejectClaim(claim.id, note.trim());
      setNote("");
      await onDone(`Reclamo ${claim.reference} ${action === "accept" ? "aceptado" : "rechazado"}.`);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="card flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono font-bold text-burgundy">{claim.reference}</span>
        <Badge tone={state.tone}>{state.label}</Badge>
      </div>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div><dt className="inline font-bold">Cliente: </dt><dd className="inline">{claim.customer_name || claim.customer_email || "—"}</dd></div>
        <div><dt className="inline font-bold">Teléfono: </dt><dd className="inline">{claim.customer_phone ? formatPhone(claim.customer_phone) : "—"}</dd></div>
        <div><dt className="inline font-bold">Caja: </dt><dd className="inline">{claim.box_title ?? "Sin caja (reclamo antiguo)"}</dd></div>
        <div><dt className="inline font-bold">Fecha: </dt><dd className="inline">{formatDateTime(claim.created_at)}</dd></div>
      </dl>
      {claim.customer_note && <p className="text-sm">Nota de la cliente: {claim.customer_note}</p>}
      {claim.admin_notes && <p className="text-sm">Nota: {claim.admin_notes}</p>}
      {claim.status === "pending" && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1">
            <Field label="Nota (opcional)" id={`claim-note-${claim.id}`} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button variant="dark" disabled={busy} aria-label={`Aceptar ${claim.reference}`} onClick={() => void decide("accept")}>Aceptar</Button>
          <Button disabled={busy} aria-label={`Rechazar ${claim.reference}`} onClick={() => void decide("reject")}>Rechazar</Button>
        </div>
      )}
    </li>
  );
}

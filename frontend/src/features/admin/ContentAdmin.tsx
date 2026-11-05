import { useState, type FormEvent } from "react";

import { FileUploadButton, IMAGE_ACCEPT, IMAGE_HINT } from "../../components/FileUploadButton";
import { DeleteDialog } from "../../components/admin/DeleteDialog";
import { diffPatch } from "../../components/admin/patch";
import { RowActions } from "../../components/admin/RowActions";
import { ShowArchivedToggle } from "../../components/admin/ShowArchivedToggle";
import { Alert, Badge, Button, Field, Select, Spinner, TextArea } from "../../components/ui";
import { errorMessage } from "../../services/api";
import { formatDateTime } from "../../services/format";
import { useAsync } from "../../services/useAsync";
import { MediaPlayer } from "../content/ContentGrid";
import { adminApi, type AdminChallenge, type AdminContent, type AdminReward } from "./api";

const KIND_LABEL = { routine: "Rutina", recipe: "Receta", growth: "Crecimiento", meal: "Alimentación" } as const;

type Run = (fn: () => Promise<unknown>, success?: string) => Promise<boolean>;
type Ask = (target: DeleteTarget) => void;
interface DeleteTarget {
  kind: "content" | "challenge" | "reward";
  id: number;
  name: string;
}
const DELETE_NOUN = { content: "contenido", challenge: "reto", reward: "recompensa" } as const;

export function ContentAdmin() {
  const [showArchived, setShowArchived] = useState(false);
  const content = useAsync(() => adminApi.content(showArchived), [showArchived]);
  const challenges = useAsync(() => adminApi.challenges(showArchived), [showArchived]);
  const rewards = useAsync(() => adminApi.rewards(showArchived), [showArchived]);
  const redemptions = useAsync(() => adminApi.redemptions(), []);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);

  const reloadAll = () => Promise.all([content.reload(), challenges.reload(), rewards.reload(), redemptions.reload()]);
  const run: Run = async (fn, success) => {
    setMessage(null);
    try {
      await fn();
      if (success) setMessage({ tone: "success", text: success });
      await reloadAll();
      return true;
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
      return false;
    }
  };

  const remove = () => {
    const t = deleting!;
    return t.kind === "content" ? adminApi.deleteContent(t.id) : t.kind === "challenge" ? adminApi.deleteChallenge(t.id) : adminApi.deleteReward(t.id);
  };
  const archiveInstead = () => {
    const t = deleting!;
    return t.kind === "content" ? adminApi.archiveContent(t.id) : t.kind === "challenge" ? adminApi.archiveChallenge(t.id) : adminApi.archiveReward(t.id);
  };

  return (
    <div className="flex flex-col gap-8">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <ShowArchivedToggle checked={showArchived} onChange={setShowArchived} />

      <section className="flex flex-col gap-4">
        <h3 className="text-2xl">Contenido</h3>
        <ContentForm onSave={(body) => run(() => adminApi.createContent(body), "Contenido creado.")} />
        {content.loading && <Spinner />}
        <ul className="flex flex-col gap-2">
          {content.data?.map((c) => <ContentRow key={c.id} item={c} run={run} ask={setDeleting} />)}
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="text-2xl">Retos</h3>
        <NewChallengeForm run={run} />
        <ul className="flex flex-col gap-2">
          {challenges.data?.map((c) => <ChallengeRow key={c.id} challenge={c} run={run} ask={setDeleting} />)}
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="text-2xl">Recompensas</h3>
        <NewRewardForm run={run} />
        <ul className="flex flex-col gap-2">
          {rewards.data?.map((r) => <RewardRow key={r.id} reward={r} run={run} ask={setDeleting} />)}
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="text-2xl">Solicitudes de recompensas</h3>
        {redemptions.data?.length === 0 && <p className="muted">No hay solicitudes.</p>}
        <ul className="flex flex-col gap-2">
          {redemptions.data?.map((r) => (
            <li key={r.id} className="card flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
              <span className="font-bold">{r.reward_name}</span>
              <span>{r.customer_email} · {formatDateTime(r.created_at)}</span>
              <Badge tone={r.status === "fulfilled" ? "green" : r.status === "requested" ? "beige" : "gray"}>{r.status}</Badge>
              {r.status === "requested" && (
                <div className="flex gap-2">
                  <Button variant="dark" onClick={() => void run(() => adminApi.decideRedemption(r.id, "fulfilled"))}>Marcar entregada</Button>
                  <Button onClick={() => void run(() => adminApi.decideRedemption(r.id, "cancelled"))}>Cancelar</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <DeleteDialog
        target={deleting}
        noun={deleting ? DELETE_NOUN[deleting.kind] : ""}
        remove={remove}
        archive={archiveInstead}
        onClose={() => setDeleting(null)}
        onDone={(outcome) => {
          setMessage({ tone: "success", text: outcome === "deleted" ? `«${deleting?.name}» eliminado.` : `«${deleting?.name}» archivado.` });
          setDeleting(null);
          void reloadAll();
        }}
      />
    </div>
  );
}

function ChallengeRow({ challenge: c, run, ask }: { challenge: AdminChallenge; run: Run; ask: Ask }) {
  const [editing, setEditing] = useState(false);
  const initial = { title: c.title, description: c.description, target_count: c.target_count };
  const [form, setForm] = useState({ title: c.title, description: c.description ?? "", target_count: String(c.target_count) });
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const changes = diffPatch(initial, { title: form.title.trim(), description: form.description.trim() || null, target_count: Number(form.target_count) });
    if (Object.keys(changes).length === 0) return setEditing(false);
    if (await run(() => adminApi.updateChallenge(c.id, changes), "Reto actualizado.")) setEditing(false);
  };
  return (
    <li className="card flex flex-col gap-3 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold">{c.title}</span>
        <span>{c.target_count} días{c.is_demo ? " · demo" : ""}</span>
        {!c.is_active && <Badge tone="gray">Archivado</Badge>}
        <RowActions
          name={c.title}
          archived={!c.is_active}
          onEdit={() => setEditing((v) => !v)}
          onArchive={() => void run(() => adminApi.archiveChallenge(c.id), "Reto archivado.")}
          onRestore={() => void run(() => adminApi.restoreChallenge(c.id), "Reto restaurado.")}
          onDelete={() => ask({ kind: "challenge", id: c.id, name: c.title })}
        />
      </div>
      {editing && (
        <form onSubmit={save} aria-label={`Editar reto ${c.title}`} className="grid gap-3 sm:grid-cols-3 sm:items-end">
          <Field label="Título del reto" id={`chg-t-${c.id}`} required minLength={2} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Field label="Días del reto" id={`chg-n-${c.id}`} type="number" min={1} value={form.target_count} onChange={(e) => setForm({ ...form, target_count: e.target.value })} />
          <Button type="submit" variant="dark">Guardar reto</Button>
          <div className="sm:col-span-3"><TextArea label="Descripción del reto" id={`chg-d-${c.id}`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        </form>
      )}
    </li>
  );
}

function RewardRow({ reward: r, run, ask }: { reward: AdminReward; run: Run; ask: Ask }) {
  const [editing, setEditing] = useState(false);
  const initial = { name: r.name, description: r.description, threshold_pct: r.threshold_pct };
  const [form, setForm] = useState({ name: r.name, description: r.description ?? "", threshold_pct: String(r.threshold_pct) });
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const changes = diffPatch(initial, { name: form.name.trim(), description: form.description.trim() || null, threshold_pct: Number(form.threshold_pct) });
    if (Object.keys(changes).length === 0) return setEditing(false);
    if (await run(() => adminApi.updateReward(r.id, changes), "Recompensa actualizada.")) setEditing(false);
  };
  return (
    <li className="card flex flex-col gap-3 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold">{r.name}</span>
        <span>{r.kind === "habit_discount" ? "Hábitos" : "Retos"} · desde {r.threshold_pct}%</span>
        {!r.is_active && <Badge tone="gray">Archivada</Badge>}
        <RowActions
          name={r.name}
          archived={!r.is_active}
          onEdit={() => setEditing((v) => !v)}
          onArchive={() => void run(() => adminApi.archiveReward(r.id), "Recompensa archivada.")}
          onRestore={() => void run(() => adminApi.restoreReward(r.id), "Recompensa restaurada.")}
          onDelete={() => ask({ kind: "reward", id: r.id, name: r.name })}
        />
      </div>
      {editing && (
        <form onSubmit={save} aria-label={`Editar recompensa ${r.name}`} className="grid gap-3 sm:grid-cols-3 sm:items-end">
          <Field label="Nombre de la recompensa" id={`rwd-n-${r.id}`} required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Field label="Porcentaje desde" id={`rwd-p-${r.id}`} type="number" min={1} max={100} value={form.threshold_pct} onChange={(e) => setForm({ ...form, threshold_pct: e.target.value })} />
          <Button type="submit" variant="dark">Guardar recompensa</Button>
          <div className="sm:col-span-3"><TextArea label="Descripción de la recompensa" id={`rwd-d-${r.id}`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        </form>
      )}
    </li>
  );
}

const EMPTY = { kind: "routine", title: "", meta: "", summary: "", body: "", media_url: "", cover_url: "", meal_slot: "" };

function ContentForm({ initial, onSave, submitLabel = "Crear contenido" }: {
  initial?: AdminContent; onSave: (body: Record<string, unknown>) => Promise<boolean>; submitLabel?: string;
}) {
  const [form, setForm] = useState(
    initial
      ? { kind: initial.kind, title: initial.title, meta: initial.meta ?? "", summary: initial.summary ?? "", body: initial.body ?? "",
          media_url: initial.media_url ?? "", cover_url: initial.cover_url ?? "", meal_slot: initial.meal_slot ?? "" }
      : EMPTY,
  );
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const current = {
      kind: form.kind, title: form.title, meta: form.meta || null, summary: form.summary || null, body: form.body || null,
      media_url: form.media_url || null, cover_url: form.cover_url || null, meal_slot: form.meal_slot || null,
    };
    if (!initial) {
      if (await onSave(current)) setForm(EMPTY);
      return;
    }
    const changes = diffPatch(
      { kind: initial.kind, title: initial.title, meta: initial.meta, summary: initial.summary, body: initial.body,
        media_url: initial.media_url, cover_url: initial.cover_url, meal_slot: initial.meal_slot },
      current,
    );
    if (Object.keys(changes).length > 0) await onSave(changes);
  };
  const id = initial ? `c${initial.id}` : "new";
  return (
    <form onSubmit={submit} className="card grid gap-3 sm:grid-cols-2">
      <Select label="Tipo" id={`${id}-kind`} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as AdminContent["kind"] })}>
        {Object.entries(KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </Select>
      <Field label="Título" id={`${id}-title`} required minLength={2} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <Field label="Detalle corto" id={`${id}-meta`} placeholder="Video · 20 min" value={form.meta} onChange={(e) => setForm({ ...form, meta: e.target.value })} />
      <div className="flex flex-col gap-3 rounded-2xl bg-cream p-4 sm:col-span-2">
        <h4 className="font-display text-lg">Video o imagen del contenido</h4>
        <UploadInput id={`${id}-media-file`} label={form.media_url ? "Cambiar video o imagen" : "Subir video o imagen"}
          accept="video/mp4,video/webm,video/quicktime,image/jpeg,image/png,image/webp"
          hint="Video MP4, WEBM o MOV de hasta 50 MB, o imagen JPG/PNG/WEBP de hasta 5 MB."
          onUploaded={(url) => setForm((f) => ({ ...f, media_url: url }))} />
        <Field label="…o pega un enlace de YouTube o Vimeo" id={`${id}-media`} type="url" pattern="https://.*"
          placeholder="https://www.youtube.com/watch?v=…" value={form.media_url} onChange={(e) => setForm({ ...form, media_url: e.target.value })} />
        {form.media_url && <MediaPreview url={form.media_url} />}
      </div>
      <div className="flex flex-col gap-3 rounded-2xl bg-cream p-4 sm:col-span-2">
        <h4 className="font-display text-lg">Portada (opcional)</h4>
        {form.cover_url && <img src={form.cover_url} alt="Portada" className="h-28 w-44 rounded-xl object-cover" />}
        <UploadInput id={`${id}-cover-file`} label={form.cover_url ? "Cambiar portada" : "Subir portada"} accept={IMAGE_ACCEPT} hint={IMAGE_HINT}
          onUploaded={(url) => setForm((f) => ({ ...f, cover_url: url }))} />
        <details>
          <summary className="cursor-pointer font-bold">Usar un enlace a una imagen</summary>
          <div className="mt-2">
            <Field label="Enlace de la portada (https://…)" id={`${id}-cover`} type="url" pattern="https://.*"
              value={form.cover_url} onChange={(e) => setForm({ ...form, cover_url: e.target.value })} />
          </div>
        </details>
        <p className="text-sm text-muted">Después de subir, pulsa «{initial ? "Guardar cambios" : "Crear contenido"}».</p>
      </div>
      <Select label="Franja (solo alimentación)" id={`${id}-slot`} value={form.meal_slot} onChange={(e) => setForm({ ...form, meal_slot: e.target.value })}>
        <option value="">—</option>
        <option value="desayuno">Desayuno</option><option value="almuerzo">Almuerzo</option><option value="cena">Cena</option><option value="snacks">Snacks</option>
      </Select>
      <div className="sm:col-span-2"><TextArea label="Contenido" id={`${id}-body`} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
      <Button type="submit" variant="dark" className="self-start">{submitLabel}</Button>
    </form>
  );
}

function ContentRow({ item, run, ask }: { item: AdminContent; run: Run; ask: Ask }) {
  const [editing, setEditing] = useState(false);
  return (
    <li className="flex flex-col gap-2 rounded-2xl bg-white p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span><strong>{item.title}</strong> · {KIND_LABEL[item.kind]}{item.is_demo ? " · demo" : ""}</span>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={item.is_published ? "green" : "gray"}>{item.is_published ? "Publicado" : "Archivado"}</Badge>
          <RowActions
            name={item.title}
            archived={!item.is_published}
            onEdit={() => setEditing((v) => !v)}
            onArchive={() => void run(() => adminApi.archiveContent(item.id), "Contenido archivado: ya no se ve en Mi Ruta.")}
            onRestore={() => void run(() => adminApi.restoreContent(item.id), "Contenido restaurado.")}
            onDelete={() => ask({ kind: "content", id: item.id, name: item.title })}
          />
        </div>
      </div>
      {editing && (
        <ContentForm
          initial={item}
          submitLabel="Guardar cambios"
          onSave={async (body) => {
            const ok = await run(() => adminApi.updateContent(item.id, body), "Contenido actualizado.");
            if (ok) setEditing(false);
            return ok;
          }}
        />
      )}
    </li>
  );
}

function NewChallengeForm({ run }: { run: Run }) {
  const [form, setForm] = useState({ title: "", description: "", target_count: "7" });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await run(() => adminApi.createChallenge({ ...form, target_count: Number(form.target_count), description: form.description || null }));
    if (ok) setForm({ title: "", description: "", target_count: "7" });
  };
  return (
    <form onSubmit={submit} className="card grid gap-3 sm:grid-cols-4 sm:items-end">
      <Field label="Título" id="ch-title" required minLength={2} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <Field label="Días para completar" id="ch-target" type="number" min={1} value={form.target_count} onChange={(e) => setForm({ ...form, target_count: e.target.value })} />
      <Button type="submit" variant="dark">Crear reto</Button>
      <div className="sm:col-span-4"><TextArea label="Descripción" id="ch-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
    </form>
  );
}

function NewRewardForm({ run }: { run: Run }) {
  const [form, setForm] = useState({ name: "", kind: "challenge", threshold_pct: "25" });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await run(() => adminApi.createReward({ ...form, threshold_pct: Number(form.threshold_pct) }));
    if (ok) setForm({ name: "", kind: "challenge", threshold_pct: "25" });
  };
  return (
    <form onSubmit={submit} className="card grid gap-3 sm:grid-cols-5 sm:items-end">
      <Field label="Nombre" id="rw-name" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <Select label="Se gana con" id="rw-kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
        <option value="challenge">Retos</option><option value="habit_discount">Hábitos</option>
      </Select>
      <Field label="Desde (%)" id="rw-pct" type="number" min={1} max={100} value={form.threshold_pct} onChange={(e) => setForm({ ...form, threshold_pct: e.target.value })} />
      <Button type="submit" variant="dark">Crear recompensa</Button>
    </form>
  );
}

/** Sube el archivo a Supabase Storage (vía la API) y devuelve la URL pública. */
export function UploadInput({ id, label, accept, hint, onUploaded }: {
  id: string; label: string; accept: string; hint?: string; onUploaded: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upload = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      const { url } = await adminApi.uploadContentMedia(file);
      onUploaded(url);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <FileUploadButton id={id} label={label} accept={accept} hint={hint} busy={busy} busyLabel="Subiendo… (los videos pueden tardar)" onFile={(f) => void upload(f)} />
      {error && <Alert>{error}</Alert>}
    </div>
  );
}

export function MediaPreview({ url }: { url: string }) {
  return (
    <div className="max-w-md">
      <MediaPlayer url={url} title="Vista previa" />
    </div>
  );
}

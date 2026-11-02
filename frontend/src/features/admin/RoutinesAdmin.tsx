import { useEffect, useState, type FormEvent } from "react";

import { Alert, Badge, Button, Field, Spinner, TextArea } from "../../components/ui";
import { IMAGE_ACCEPT, IMAGE_HINT } from "../../components/FileUploadButton";
import { errorMessage } from "../../services/api";
import { formatDateTime } from "../../services/format";
import { formatPhone } from "../../services/phone";
import type { Profile } from "../../services/types";
import { useAsync } from "../../services/useAsync";
import { RoutineStatsCard } from "../routines/RoutineStatsCard";
import { adminApi, type AdminRoutine, type AdminRoutineDetail, type AdminRoutineStep } from "./api";
import { MediaPreview, UploadInput } from "./ContentAdmin";

const STATUS_LABEL = { draft: "Borrador", active: "Activa", archived: "Archivada" } as const;
const STATUS_TONE = { draft: "gray", active: "green", archived: "beige" } as const;
const VIDEO_ACCEPT = "video/mp4,video/webm,video/quicktime,image/jpeg,image/png,image/webp";

type View = { kind: "list" } | { kind: "new" } | { kind: "edit"; id: number } | { kind: "progress"; id: number };

export function RoutinesAdmin() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [user, setUser] = useState<Profile | null>(null);
  const [view, setView] = useState<View>({ kind: "list" });

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const users = useAsync(() => adminApi.profiles(debounced || undefined), [debounced]);

  const choose = (profile: Profile | null) => {
    setUser(profile);
    setView({ kind: "list" });
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="card flex flex-col gap-3" aria-label="Elegir usuario">
        <h3 className="text-xl">Usuario</h3>
        {user ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <UserLine profile={user} />
            <Button onClick={() => choose(null)}>Cambiar usuario</Button>
          </div>
        ) : (
          <>
            <Field label="Buscar por nombre, correo o celular" id="routine-user-search" value={query} onChange={(e) => setQuery(e.target.value)} />
            {users.loading && <Spinner />}
            {users.error && <Alert>{users.error}</Alert>}
            {users.data?.length === 0 && <p className="muted">No encontramos a nadie con esa búsqueda.</p>}
            <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
              {users.data?.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => choose(p)} className="w-full rounded-2xl bg-cream p-3 text-left hover:ring-2 hover:ring-burgundy focus-visible:ring-2 focus-visible:ring-burgundy">
                    <UserLine profile={p} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {user && view.kind === "list" && <UserRoutines user={user} onOpen={setView} />}
      {user && view.kind === "new" && (
        <RoutineEditor key="new" userId={user.id} id={null} onBack={() => setView({ kind: "list" })} onCreated={(id) => setView({ kind: "edit", id })} />
      )}
      {user && view.kind === "edit" && (
        <RoutineEditor key={view.id} userId={user.id} id={view.id} onBack={() => setView({ kind: "list" })} onCreated={() => {}} />
      )}
      {user && view.kind === "progress" && <ProgressView id={view.id} onBack={() => setView({ kind: "list" })} />}
    </div>
  );
}

function UserLine({ profile }: { profile: Profile }) {
  return (
    <div className="text-sm">
      <p className="font-bold">{profile.full_name || "Sin nombre"}</p>
      <p>{profile.email}{profile.phone ? ` · ${formatPhone(profile.phone)}` : ""}</p>
    </div>
  );
}

function UserRoutines({ user, onOpen }: { user: Profile; onOpen: (view: View) => void }) {
  const routines = useAsync(() => adminApi.routines(user.id), [user.id]);
  const active = useAsync(() => adminApi.subscriptions("active"), [user.id]);
  const sub = active.data?.find((s) => s.user_id === user.id);

  return (
    <section className="flex flex-col gap-4">
      {active.data && (sub ? (
        <Alert tone="success">S2 Plus activa hasta {formatDateTime(sub.ends_at)}.</Alert>
      ) : (
        <Alert tone="info">Esta persona no tiene S2 Plus activa: podrá ver la rutina cuando active o renueve su membresía.</Alert>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-2xl">Rutinas de esta persona</h3>
        <Button variant="dark" onClick={() => onOpen({ kind: "new" })}>Nueva rutina</Button>
      </div>
      {routines.loading && <Spinner />}
      {routines.error && <Alert>{routines.error}</Alert>}
      {routines.data?.length === 0 && <p className="muted">Todavía no tiene rutinas personalizadas.</p>}
      <ul className="flex flex-col gap-2">
        {routines.data?.map((r: AdminRoutine) => (
          <li key={r.id} className="card flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <div>
              <p className="font-bold">{r.title}</p>
              <p className="text-muted">{r.step_count} pasos · {r.progress_pct}% de avance</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
              <Button onClick={() => onOpen({ kind: "edit", id: r.id })}>Editar</Button>
              <Button onClick={() => onOpen({ kind: "progress", id: r.id })}>Ver progreso</Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RoutineEditor({ userId, id, onBack, onCreated }: { userId: string; id: number | null; onBack: () => void; onCreated: (id: number) => void }) {
  const loaded = useAsync<AdminRoutineDetail | null>(() => (id === null ? Promise.resolve(null) : adminApi.routine(id)), [id]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const routine = loaded.data ?? null;

  const act = async (fn: () => Promise<AdminRoutineDetail>, message?: string): Promise<boolean> => {
    setError(null);
    setNotice(null);
    try {
      const updated = await fn();
      loaded.setData(updated);
      if (message) setNotice(message);
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onBack}>← Volver a las rutinas</Button>
        <h3 className="text-2xl">{id === null ? "Nueva rutina" : "Editar rutina"}</h3>
        {routine && <Badge tone={STATUS_TONE[routine.status]}>{STATUS_LABEL[routine.status]}</Badge>}
      </div>
      {loaded.loading && <Spinner />}
      {loaded.error && <Alert>{loaded.error}</Alert>}
      {error && <Alert>{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {(id === null || routine) && (
        <RoutineForm
          key={routine?.id ?? "new"}
          routine={routine}
          onSubmit={async (body) => {
            if (routine) return act(() => adminApi.updateRoutine(routine.id, body), "Datos guardados.");
            setError(null);
            try {
              const created = await adminApi.createRoutine({ ...body, user_id: userId });
              onCreated(created.id);
              return true;
            } catch (err) {
              setError(errorMessage(err));
              return false;
            }
          }}
        />
      )}

      {routine && (
        <>
          <div className="flex flex-wrap gap-2">
            {routine.status !== "active" && (
              <Button variant="dark" onClick={() => void act(() => adminApi.updateRoutine(routine.id, { status: "active" }), "Rutina activada.")}>Activar</Button>
            )}
            {routine.status === "active" && (
              <Button onClick={() => void act(() => adminApi.updateRoutine(routine.id, { status: "archived" }), "Rutina archivada.")}>Archivar</Button>
            )}
            {routine.status !== "draft" && (
              <Button onClick={() => void act(() => adminApi.updateRoutine(routine.id, { status: "draft" }), "La rutina volvió a borrador.")}>Volver a borrador</Button>
            )}
          </div>
          <StepsEditor routine={routine} act={act} />
        </>
      )}
    </section>
  );
}

function RoutineForm({ routine, onSubmit }: { routine: AdminRoutineDetail | null; onSubmit: (body: Record<string, unknown>) => Promise<boolean> }) {
  const [form, setForm] = useState({
    title: routine?.title ?? "",
    goal: routine?.goal ?? "",
    description: routine?.description ?? "",
    sequential: routine?.sequential ?? true,
  });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await onSubmit({
      title: form.title.trim(),
      goal: form.goal.trim() || null,
      description: form.description.trim() || null,
      sequential: form.sequential,
    });
  };
  return (
    <form onSubmit={submit} className="card grid gap-3 sm:grid-cols-2">
      <Field label="Título" id="routine-title" required minLength={2} maxLength={160} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <Field label="Objetivo" id="routine-goal" maxLength={160} placeholder="Tonificar piernas" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} />
      <div className="sm:col-span-2">
        <TextArea label="Descripción" id="routine-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
      <label className="flex items-center gap-2 sm:col-span-2">
        <input type="checkbox" checked={form.sequential} onChange={(e) => setForm({ ...form, sequential: e.target.checked })} />
        Desbloquear pasos en orden
      </label>
      <Button type="submit" variant="dark" className="self-start">{routine ? "Guardar datos" : "Crear rutina"}</Button>
    </form>
  );
}

function StepsEditor({ routine, act }: { routine: AdminRoutineDetail; act: (fn: () => Promise<AdminRoutineDetail>, message?: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const steps = routine.steps;

  const move = (index: number, delta: -1 | 1) => {
    const ids = steps.map((s) => s.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    void act(() => adminApi.reorderRoutineSteps(routine.id, ids));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="font-display text-xl">Pasos</h4>
        {editing === null && <Button variant="dark" onClick={() => setEditing("new")}>Agregar paso</Button>}
      </div>
      {steps.length === 0 && <p className="muted">Agrega al menos un paso para poder activar la rutina.</p>}
      <ol className="flex flex-col gap-2">
        {steps.map((s, i) => (
          <li key={s.id} className="flex flex-col gap-2 rounded-2xl bg-white p-3 text-sm">
            {editing === s.id ? (
              <StepForm
                initial={s}
                onCancel={() => setEditing(null)}
                onSave={async (body) => {
                  const ok = await act(() => adminApi.updateRoutineStep(s.id, body), "Paso guardado.");
                  if (ok) setEditing(null);
                  return ok;
                }}
              />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-bold">{s.position}. {s.title}</p>
                  <p className="text-muted">
                    {[s.block_label, s.sets_reps, s.duration_minutes ? `${s.duration_minutes} min` : null, s.media_url ? "con video" : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button aria-label={`Subir el paso ${s.position}`} disabled={i === 0} onClick={() => move(i, -1)}>↑</Button>
                  <Button aria-label={`Bajar el paso ${s.position}`} disabled={i === steps.length - 1} onClick={() => move(i, 1)}>↓</Button>
                  <Button onClick={() => setEditing(s.id)}>Editar</Button>
                  <Button onClick={() => setConfirming(s.id)}>Eliminar</Button>
                </div>
              </div>
            )}
            {confirming === s.id && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-red-50 p-3 text-red-900" role="alertdialog" aria-label="Confirmar eliminación">
                <span>¿Eliminar este paso? También se borra el avance que la persona haya registrado en él.</span>
                <Button variant="dark" onClick={async () => { if (await act(() => adminApi.deleteRoutineStep(s.id), "Paso eliminado.")) setConfirming(null); }}>Sí, eliminar</Button>
                <Button onClick={() => setConfirming(null)}>Cancelar</Button>
              </div>
            )}
          </li>
        ))}
      </ol>
      {editing === "new" && (
        <div className="card">
          <StepForm
            onCancel={() => setEditing(null)}
            onSave={async (body) => {
              const ok = await act(() => adminApi.addRoutineStep(routine.id, body), "Paso agregado.");
              if (ok) setEditing(null);
              return ok;
            }}
          />
        </div>
      )}
    </div>
  );
}

function StepForm({ initial, onSave, onCancel }: { initial?: AdminRoutineStep; onSave: (body: Record<string, unknown>) => Promise<boolean>; onCancel: () => void }) {
  const [form, setForm] = useState({
    title: initial?.title ?? "",
    block_label: initial?.block_label ?? "",
    sets_reps: initial?.sets_reps ?? "",
    duration: initial?.duration_minutes ? String(initial.duration_minutes) : "",
    instructions: initial?.instructions ?? "",
    media_url: initial?.media_url ?? "",
    cover_url: initial?.cover_url ?? "",
  });
  const id = initial ? `step-${initial.id}` : "step-new";
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await onSave({
      title: form.title.trim(),
      block_label: form.block_label.trim() || null,
      sets_reps: form.sets_reps.trim() || null,
      duration_minutes: form.duration ? Number(form.duration) : null,
      instructions: form.instructions.trim() || null,
      media_url: form.media_url.trim() || null,
      cover_url: form.cover_url.trim() || null,
    });
  };
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <Field label="Título del paso" id={`${id}-title`} required minLength={2} maxLength={160} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <Field label="Bloque" id={`${id}-block`} maxLength={80} placeholder="Semana 1 · Día 2" value={form.block_label} onChange={(e) => setForm({ ...form, block_label: e.target.value })} />
      <Field label="Series y repeticiones" id={`${id}-sets`} maxLength={80} placeholder="3 × 12" value={form.sets_reps} onChange={(e) => setForm({ ...form, sets_reps: e.target.value })} />
      <Field label="Duración (minutos)" id={`${id}-duration`} type="number" min={1} max={600} value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} />
      <div className="sm:col-span-2">
        <TextArea label="Instrucciones" id={`${id}-instructions`} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
      </div>
      <div className="flex flex-col gap-3 rounded-2xl bg-cream p-4 sm:col-span-2">
        <h5 className="font-display text-lg">Video del paso</h5>
        <UploadInput id={`${id}-media-file`} label={form.media_url ? "Cambiar video" : "Subir video"} accept={VIDEO_ACCEPT}
          hint="Video MP4, WEBM o MOV de hasta 50 MB, o imagen JPG/PNG/WEBP de hasta 5 MB."
          onUploaded={(url) => setForm((f) => ({ ...f, media_url: url }))} />
        <Field label="…o pega un enlace de YouTube o Vimeo" id={`${id}-media`} type="url" pattern="https://.*" placeholder="https://www.youtube.com/watch?v=…"
          value={form.media_url} onChange={(e) => setForm({ ...form, media_url: e.target.value })} />
        {form.media_url && <MediaPreview url={form.media_url} />}
      </div>
      <div className="flex flex-col gap-3 rounded-2xl bg-cream p-4 sm:col-span-2">
        <h5 className="font-display text-lg">Portada (opcional)</h5>
        {form.cover_url && <img src={form.cover_url} alt="Portada" className="h-28 w-44 rounded-xl object-cover" />}
        <UploadInput id={`${id}-cover-file`} label={form.cover_url ? "Cambiar portada" : "Subir portada"} accept={IMAGE_ACCEPT} hint={IMAGE_HINT}
          onUploaded={(url) => setForm((f) => ({ ...f, cover_url: url }))} />
        <details>
          <summary className="cursor-pointer font-bold">Usar un enlace a una imagen</summary>
          <div className="mt-2">
            <Field label="Enlace de la portada (https://…)" id={`${id}-cover`} type="url" pattern="https://.*" value={form.cover_url} onChange={(e) => setForm({ ...form, cover_url: e.target.value })} />
          </div>
        </details>
      </div>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" variant="dark">{initial ? "Guardar paso" : "Agregar paso"}</Button>
        <Button onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  );
}

function ProgressView({ id, onBack }: { id: number; onBack: () => void }) {
  const progress = useAsync(() => adminApi.routineProgress(id), [id]);
  const data = progress.data;
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onBack}>← Volver a las rutinas</Button>
        <h3 className="text-2xl">Progreso{data ? `: ${data.title}` : ""}</h3>
      </div>
      {progress.loading && <Spinner />}
      {progress.error && <Alert>{progress.error}</Alert>}
      {data && (
        <>
          <div className="card"><RoutineStatsCard stats={data.stats} /></div>
          <ol className="flex flex-col gap-2">
            {data.steps.map((s) => (
              <li key={s.id} className="rounded-2xl bg-white p-3 text-sm">
                <p className="font-bold">{s.position}. {s.title}</p>
                {s.completion ? (
                  <p className="text-muted">
                    Completado el {formatDateTime(s.completion.completed_at)}
                    {s.completion.minutes ? ` · ${s.completion.minutes} min` : ""}
                    {s.completion.effort ? ` · esfuerzo ${s.completion.effort}/5` : ""}
                    {s.completion.note ? ` · «${s.completion.note}»` : ""}
                  </p>
                ) : (
                  <p className="text-muted">Pendiente</p>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

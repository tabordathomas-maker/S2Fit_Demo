import { useState, type FormEvent } from "react";

import { Alert, Button, LinkButton, ProgressBar, Spinner, TextArea } from "../../components/ui";
import { errorMessage } from "../../services/api";
import { formatDateTime } from "../../services/format";
import { useAsync } from "../../services/useAsync";
import { MediaPlayer } from "../content/ContentGrid";
import { subscriptionsApi } from "../subscriptions/api";
import { routinesApi, type RoutineDetail, type RoutineStep, type RoutineSummary, type StepState } from "./api";
import { RoutineStatsCard } from "./RoutineStatsCard";

const STATE_LABEL: Record<StepState, string> = { done: "completado", current: "siguiente paso", locked: "bloqueado", available: "disponible" };

/** Sección «Mi rutina personalizada» de Mi Ruta. No muestra nada si no hay rutinas. */
export function RoutinePanel() {
  const list = useAsync(() => routinesApi.list(), []);
  const [selected, setSelected] = useState<number | null>(null);
  const routines = list.data ?? [];
  if (list.loading && !list.data) return null;
  if (list.error || routines.length === 0) return null;
  const current = routines.find((r) => r.id === selected) ?? routines[0];

  return (
    <section className="card flex flex-col gap-5 p-6 sm:p-9" aria-labelledby="my-routine-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="my-routine-title" className="text-[28px]">Mi rutina personalizada</h2>
        {routines.length > 1 && (
          <div>
            <label htmlFor="routine-select" className="sr-only">Elegir rutina</label>
            <select id="routine-select" className="input" value={current.id} onChange={(e) => setSelected(Number(e.target.value))}>
              {routines.map((r) => (
                <option key={r.id} value={r.id}>{r.title}{r.status === "archived" ? " (archivada)" : ""}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      {current.locked ? <LockedRoutine routine={current} /> : <RoutineView key={current.id} id={current.id} onChange={() => void list.reload()} />}
    </section>
  );
}

function LockedRoutine({ routine }: { routine: RoutineSummary }) {
  const membership = useAsync(() => subscriptionsApi.membership(), []);
  const hadMembership = Boolean(membership.data?.subscription);
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl bg-cream p-5">
      <p className="font-display text-xl"><span aria-hidden="true">🔒 </span>{routine.title}</p>
      {routine.goal && <p className="muted">Objetivo: {routine.goal}</p>}
      <div className="w-full max-w-md">
        <ProgressBar percent={routine.progress_pct} label={`Avance de ${routine.title}`} />
        <p className="mt-1 text-sm text-muted">{routine.progress_pct}% de avance</p>
      </div>
      <p className="font-bold">Tu rutina personalizada es parte de S2 Plus</p>
      <LinkButton to="/plus" variant="dark">{hadMembership ? "Renovar S2 Plus" : "Conocer S2 Plus"}</LinkButton>
    </div>
  );
}

function RoutineView({ id, onChange }: { id: number; onChange: () => void }) {
  const detail = useAsync(() => routinesApi.get(id), [id]);
  const [openStep, setOpenStep] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<RoutineDetail>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await detail.reload();
      onChange();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const data = detail.data;
  return (
    <div className="flex flex-col gap-6">
      {detail.loading && !data && <Spinner />}
      {detail.error && <Alert>{detail.error}</Alert>}
      {error && <Alert>{error}</Alert>}
      {data && (
        <>
          <div>
            <p className="font-display text-xl">{data.title}</p>
            {data.goal && <p className="muted">Objetivo: {data.goal}</p>}
            {data.description && <p className="mt-2">{data.description}</p>}
            {data.status === "archived" && <p className="mt-2 text-sm text-muted">Esta rutina está archivada: puedes revisarla, pero ya no admite cambios.</p>}
          </div>
          <div className="rounded-2xl bg-cream p-4"><RoutineStatsCard stats={data.stats} /></div>
          <Roadmap
            steps={data.steps}
            archived={data.status === "archived"}
            openStep={openStep}
            onToggle={(stepId) => setOpenStep((open) => (open === stepId ? null : stepId))}
            busy={busy}
            onComplete={(step, body) => act(() => routinesApi.complete(id, step.id, body))}
            onUndo={(step) => act(() => routinesApi.undo(id, step.id))}
          />
        </>
      )}
    </div>
  );
}

function Roadmap({ steps, archived, openStep, onToggle, busy, onComplete, onUndo }: {
  steps: RoutineStep[];
  archived: boolean;
  openStep: number | null;
  onToggle: (stepId: number) => void;
  busy: boolean;
  onComplete: (step: RoutineStep, body: { minutes: number | null; effort: number | null; note: string | null }) => Promise<boolean>;
  onUndo: (step: RoutineStep) => Promise<boolean>;
}) {
  return (
    <ol className="flex flex-col" aria-label="Pasos de la rutina">
      {steps.map((step, i) => {
        const showBlock = step.block_label && step.block_label !== steps[i - 1]?.block_label;
        const isLast = i === steps.length - 1;
        return (
          <li key={step.id} className="flex flex-col">
            {showBlock && <p className="mb-2 mt-3 text-sm font-bold uppercase tracking-wide text-burgundy">{step.block_label}</p>}
            <div className="flex gap-4">
              <div className="flex flex-col items-center">
                <Node step={step} open={openStep === step.id} onClick={() => onToggle(step.id)} />
                {!isLast && <div className="w-0.5 flex-1 bg-beige" aria-hidden="true" />}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2 pb-6">
                <p className={`pt-2 font-bold ${step.state === "locked" ? "text-muted" : ""}`}>{step.title}</p>
                {step.state === "current" && <p className="text-sm font-bold text-burgundy">Siguiente paso</p>}
                {openStep === step.id && step.state !== "locked" && (
                  <StepDetail step={step} readOnly={archived} busy={busy} onComplete={onComplete} onUndo={onUndo} />
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Node({ step, open, onClick }: { step: RoutineStep; open: boolean; onClick: () => void }) {
  const styles: Record<StepState, string> = {
    done: "border-burgundy bg-burgundy text-cream",
    current: "border-burgundy bg-white text-burgundy ring-4 ring-burgundy/30",
    locked: "border-beige bg-neutral-200 text-muted",
    available: "border-burgundy bg-white text-burgundy",
  };
  const locked = step.state === "locked";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locked}
      aria-expanded={locked ? undefined : open}
      aria-label={`Paso ${step.position}: ${step.title}, ${STATE_LABEL[step.state]}`}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-burgundy ${styles[step.state]}`}
    >
      <span aria-hidden="true">{step.state === "done" ? "✓" : locked ? "🔒" : step.position}</span>
    </button>
  );
}

function StepDetail({ step, readOnly, busy, onComplete, onUndo }: {
  step: RoutineStep;
  readOnly: boolean;
  busy: boolean;
  onComplete: (step: RoutineStep, body: { minutes: number | null; effort: number | null; note: string | null }) => Promise<boolean>;
  onUndo: (step: RoutineStep) => Promise<boolean>;
}) {
  const [minutes, setMinutes] = useState("");
  const [effort, setEffort] = useState<number | null>(null);
  const [note, setNote] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await onComplete(step, { minutes: minutes ? Number(minutes) : null, effort, note: note.trim() || null });
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-cream p-4">
      {step.media_url ? (
        <div className="max-w-md"><MediaPlayer url={step.media_url} title={step.title} /></div>
      ) : (
        step.cover_url && <img src={step.cover_url} alt={step.title} className="h-40 w-64 max-w-full rounded-xl object-cover" />
      )}
      {(step.sets_reps || step.duration_minutes) && (
        <p className="text-sm font-bold">
          {[step.sets_reps, step.duration_minutes ? `${step.duration_minutes} min` : null].filter(Boolean).join(" · ")}
        </p>
      )}
      {step.instructions && <p className="whitespace-pre-line">{step.instructions}</p>}

      {step.state === "done" && step.completion && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm">
            Completado el {formatDateTime(step.completion.completed_at)}
            {step.completion.minutes ? ` · ${step.completion.minutes} min` : ""}
            {step.completion.effort ? ` · esfuerzo ${step.completion.effort}/5` : ""}
            {step.completion.note ? ` · «${step.completion.note}»` : ""}
          </p>
          {!readOnly && <Button disabled={busy} onClick={() => void onUndo(step)}>Deshacer</Button>}
        </div>
      )}

      {step.state !== "done" && !readOnly && (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div>
            <label htmlFor={`min-${step.id}`} className="label">Minutos (opcional)</label>
            <input id={`min-${step.id}`} className="input w-32" type="number" min={1} max={600} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </div>
          <div role="group" aria-label="Esfuerzo (1 a 5)">
            <p className="label">Esfuerzo (opcional)</p>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={effort === n}
                  aria-label={`Esfuerzo ${n}`}
                  onClick={() => setEffort(effort === n ? null : n)}
                  className={`h-11 w-11 rounded-full border-2 font-bold ${effort === n ? "border-burgundy bg-burgundy text-cream" : "border-beige bg-white text-ink hover:border-burgundy"}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <TextArea label="Nota (opcional)" id={`note-${step.id}`} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          <Button type="submit" variant="dark" className="self-start" disabled={busy}>Marcar como completado</Button>
        </form>
      )}
    </div>
  );
}

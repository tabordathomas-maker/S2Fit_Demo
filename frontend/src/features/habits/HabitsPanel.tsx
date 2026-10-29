import { useState, type FormEvent } from "react";

import { Alert, Button, Pill, ProgressBar, Spinner } from "../../components/ui";
import { errorMessage } from "../../services/api";
import type { HabitSummary } from "../../services/types";
import { useAsync } from "../../services/useAsync";
import { habitsApi } from "./api";

function dayLabel(iso: string, today: string): string {
  if (iso === today) return "Hoy";
  const date = new Date(`${iso}T12:00:00`);
  return date.toLocaleDateString("es-CO", { weekday: "short", day: "numeric" });
}

export function HabitsPanel({ onChange }: { onChange?: () => void }) {
  const [selectedDate, setSelectedDate] = useState<string | undefined>();
  const summary = useAsync(() => habitsApi.summary(selectedDate), [selectedDate]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<number | null>(null);
  const [newHabit, setNewHabit] = useState("");

  const apply = (next: HabitSummary) => {
    summary.setData(next);
    onChange?.();
  };

  const toggle = async (habitId: number, completed: boolean) => {
    if (!summary.data) return;
    setSaving(habitId);
    setError(null);
    try {
      apply(await habitsApi.setLog(habitId, summary.data.today.date, !completed));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(null);
    }
  };

  const addHabit = async (e: FormEvent) => {
    e.preventDefault();
    if (!newHabit.trim()) return;
    setError(null);
    try {
      apply(await habitsApi.create(newHabit.trim()));
      setNewHabit("");
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  if (summary.loading && !summary.data) return <Spinner label="Cargando tus hábitos…" />;
  if (summary.error) return <Alert>{summary.error}</Alert>;
  if (!summary.data) return null;

  const { today, history, weekly_percent } = summary.data;
  const todayIso = history[0]?.date ?? today.date;
  const editableDays = history.slice(0, 7);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[28px]">Mi panel de hábitos</h3>
        <span className="font-display text-[32px] text-burgundy" aria-label={`Cumplimiento ${today.percent}%`}>{today.percent}%</span>
      </div>
      <ProgressBar percent={today.percent} label="Cumplimiento del día" />

      <div className="flex flex-wrap gap-2" aria-label="Elegir día">
        {editableDays.map((d) => (
          <button
            key={d.date}
            type="button"
            onClick={() => setSelectedDate(d.date === todayIso ? undefined : d.date)}
            aria-pressed={d.date === today.date}
            className={`rounded-full px-3 py-1 text-sm font-bold ${d.date === today.date ? "bg-ink text-cream" : "bg-cream"}`}
          >
            {dayLabel(d.date, todayIso)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2.5">
        {today.habits.map((h) => (
          <Pill key={h.id} active={h.completed} disabled={saving === h.id} onClick={() => toggle(h.id, h.completed)}>
            {h.completed ? "✓ " : ""}{h.name}
          </Pill>
        ))}
      </div>
      {error && <Alert>{error}</Alert>}

      <form onSubmit={addHabit} className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="new-habit" className="label">Agregar un hábito</label>
          <input id="new-habit" className="input" maxLength={80} value={newHabit} onChange={(e) => setNewHabit(e.target.value)} placeholder="Ej.: Leer 10 páginas" />
        </div>
        <Button type="submit">Agregar</Button>
      </form>

      <div>
        <p className="mb-2 font-bold">Últimos 14 días · cumplimiento semanal {weekly_percent}%</p>
        <ol className="flex h-24 items-end gap-1.5" aria-label="Historial de hábitos por día">
          {[...history].reverse().map((d) => (
            <li key={d.date} className="flex flex-1 flex-col items-center gap-1" title={`${d.date}: ${d.percent}%`}>
              <span className="sr-only">{d.date}: {d.completed} de {d.total} ({d.percent}%)</span>
              <span className="w-full rounded-t-md bg-burgundy" style={{ height: `${Math.max(4, d.percent * 0.8)}px`, opacity: d.percent ? 1 : 0.25 }} aria-hidden />
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

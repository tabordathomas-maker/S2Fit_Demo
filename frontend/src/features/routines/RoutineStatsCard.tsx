import { ProgressBar } from "../../components/ui";
import type { RoutineStats } from "./api";

function weekLabel(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-cream p-3">
      <p className="text-sm text-muted">{label}</p>
      <p className="text-xl font-bold text-burgundy">{value}</p>
    </div>
  );
}

/** Estadísticas de una rutina: avance, racha, minutos, esfuerzo y últimas 8 semanas (barras con divs). */
export function RoutineStatsCard({ stats }: { stats: RoutineStats }) {
  const max = Math.max(1, ...stats.weekly.map((w) => w.completions));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-bold">Avance</p>
          <p className="text-lg font-bold text-burgundy">{stats.progress_pct}%</p>
        </div>
        <ProgressBar percent={stats.progress_pct} label="Avance de la rutina" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Pasos completados" value={`${stats.completed_steps}/${stats.total_steps}`} />
        <Metric label="Racha" value={`${stats.current_streak_days} ${stats.current_streak_days === 1 ? "día" : "días"}`} />
        <Metric label="Minutos totales" value={String(stats.total_minutes)} />
        <Metric label="Esfuerzo promedio" value={stats.avg_effort === null ? "—" : `${stats.avg_effort} / 5`} />
      </div>
      <div>
        <p className="mb-2 text-sm font-bold">Últimas 8 semanas</p>
        <ul className="flex h-28 items-end gap-2" aria-label="Pasos completados por semana">
          {stats.weekly.map((w) => (
            <li key={w.week_start} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <div
                role="img"
                aria-label={`Semana del ${weekLabel(w.week_start)}: ${w.completions} ${w.completions === 1 ? "paso" : "pasos"}, ${w.minutes} minutos`}
                className={`w-full rounded-t-md ${w.completions ? "bg-burgundy" : "bg-beige"}`}
                style={{ height: `${w.completions ? Math.max(8, (w.completions / max) * 100) : 4}%` }}
              />
              <span className="text-[11px] text-muted" aria-hidden="true">{weekLabel(w.week_start)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

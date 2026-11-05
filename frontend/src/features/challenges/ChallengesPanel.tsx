import { useState } from "react";

import { Alert, Badge, Button, ProgressBar } from "../../components/ui";
import { errorMessage } from "../../services/api";
import type { ChallengesSummary } from "../../services/types";
import { challengesApi } from "./api";

/** Lista de retos (todos gratis) con unirse / registrar avance del día. */
export function ChallengesPanel({
  data,
  onUpdate,
  canParticipate,
}: {
  data: ChallengesSummary;
  onUpdate: (next: ChallengesSummary) => void;
  canParticipate: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const challenges = data.challenges;

  const act = async (fn: () => Promise<ChallengesSummary>) => {
    setError(null);
    try {
      onUpdate(await fn());
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  if (challenges.length === 0) return <p className="muted">Pronto publicaremos nuevos retos.</p>;

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))]">
        {challenges.map((c) => (
          <article key={c.id} className="flex flex-col gap-3 rounded-[18px] border-2 border-beige bg-cream p-[18px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-display text-lg">{c.title}</h4>
              {c.completed && <Badge tone="burgundy">Completado</Badge>}
            </div>
            {c.description && <p className="muted text-sm">{c.description}</p>}
            <ProgressBar percent={(c.progress / c.target_count) * 100} label={`Avance de ${c.title}`} />
            <p className="text-sm font-bold">{c.progress} de {c.target_count} días</p>
            {canParticipate && !c.joined && (
              <Button onClick={() => act(() => challengesApi.join(c.id))}>Unirme</Button>
            )}
            {c.joined && !c.completed && (
              <Button variant="dark" disabled={!c.can_progress_today} onClick={() => act(() => challengesApi.progress(c.id))}>
                {c.can_progress_today ? "Registrar avance de hoy" : "Avance de hoy registrado"}
              </Button>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

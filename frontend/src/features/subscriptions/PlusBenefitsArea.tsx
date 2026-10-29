import { useState } from "react";

import { Alert, LockIcon, Pill, ProgressBar } from "../../components/ui";
import type { ContentItem } from "../../services/types";
import { useAsync } from "../../services/useAsync";
import { challengesApi } from "../challenges/api";
import { ChallengesPanel } from "../challenges/ChallengesPanel";
import { RewardsGrid } from "../challenges/RewardsGrid";
import { contentApi } from "../content/api";
import { ContentCard } from "../content/ContentGrid";

const MEAL_SLOTS = [
  { slot: "desayuno", label: "Desayuno" },
  { slot: "almuerzo", label: "Almuerzo" },
  { slot: "cena", label: "Cena" },
  { slot: "snacks", label: "Snacks" },
];

function MealsPanel({ meals }: { meals: ContentItem[] }) {
  const [slot, setSlot] = useState("desayuno");
  const meal = meals.find((m) => m.meal_slot === slot);
  return (
    <div className="flex flex-col gap-5">
      <h3 className="text-[28px]">Alimentación diaria</h3>
      <div className="flex flex-wrap gap-2">
        {MEAL_SLOTS.map((m) => <Pill key={m.slot} active={slot === m.slot} onClick={() => setSlot(m.slot)}>{m.label}</Pill>)}
      </div>
      <div className="card">
        <p className="muted text-lg">{meal?.body ?? meal?.title ?? "Pronto publicaremos la idea de hoy."}</p>
      </div>
    </div>
  );
}

function ActiveArea() {
  const plusContent = useAsync(() => contentApi.list(), []);
  const challenges = useAsync(() => challengesApi.list(), []);
  const rewards = useAsync(() => challengesApi.rewards(), []);
  const items = plusContent.data?.filter((c) => c.access === "plus") ?? [];
  const meals = items.filter((c) => c.kind === "meal");
  const others = items.filter((c) => c.kind !== "meal");
  const challengeRewards = rewards.data?.rewards.filter((r) => r.kind === "challenge") ?? [];
  const percent = rewards.data?.challenge_percent ?? challenges.data?.challenge_percent ?? 0;

  return (
    <div className="flex flex-col gap-14">
      {plusContent.error && <Alert>{plusContent.error}</Alert>}
      <MealsPanel meals={meals} />
      {others.length > 0 && (
        <div className="flex flex-col gap-5">
          <h3 className="text-[28px]">Contenido exclusivo</h3>
          <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]">
            {others.map((item) => <ContentCard key={item.id} item={item} />)}
          </div>
        </div>
      )}
      <div className="card flex flex-col gap-6 p-6 sm:p-9">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[28px]">Mis retos y recompensas</h3>
          <span className="font-display text-[32px] text-burgundy">{percent}%</span>
        </div>
        <ProgressBar percent={percent} label="Avance de tus retos" />
        {challenges.error && <Alert>{challenges.error}</Alert>}
        {challenges.data && (
          <ChallengesPanel
            data={challenges.data}
            access="plus"
            canParticipate
            onUpdate={(next) => { challenges.setData(next); void rewards.reload(); }}
          />
        )}
        <RewardsGrid rewards={challengeRewards} onRedeemed={() => void rewards.reload()} />
      </div>
    </div>
  );
}

/** Beneficios de S2 Plus: visibles solo con membresía activa (el backend lo vuelve a comprobar). */
export function PlusBenefitsArea({ active, signedIn }: { active: boolean; signedIn: boolean }) {
  if (active) return <ActiveArea />;
  return (
    <div className="card flex flex-col items-start gap-3 border-2 border-dashed border-beige">
      <span className="flex items-center gap-2 font-bold text-burgundy"><LockIcon /> Área exclusiva S2 Plus</span>
      <h3 className="text-2xl">Alimentación diaria, rutinas personalizadas, retos y recompensas</h3>
      <p className="muted">
        {signedIn
          ? "Se desbloquea cuando tu membresía esté activa, es decir, cuando verifiquemos tu pago."
          : "Ingresa y activa tu membresía para acceder a este contenido."}
      </p>
    </div>
  );
}

import { Alert, LinkButton, SectionTitle } from "../components/ui";
import { useAuth } from "../features/auth/AuthProvider";
import { challengesApi } from "../features/challenges/api";
import { ChallengesPanel } from "../features/challenges/ChallengesPanel";
import { RewardsGrid } from "../features/challenges/RewardsGrid";
import { ContentTabs } from "../features/content/ContentGrid";
import { HabitsPanel } from "../features/habits/HabitsPanel";
import { useAsync } from "../services/useAsync";

function SignedInWellness() {
  const rewards = useAsync(() => challengesApi.rewards(), []);
  const challenges = useAsync(() => challengesApi.list(), []);
  const habitRewards = rewards.data?.rewards.filter((r) => r.kind === "habit_discount") ?? [];

  return (
    <>
      <div className="card flex flex-col gap-6 p-6 sm:p-9">
        <HabitsPanel onChange={() => void rewards.reload()} />
        <p className="muted">
          Cumple hábitos para desbloquear descuentos en prendas S2 (porcentajes de ejemplo). Se calcula con tu cumplimiento de los últimos 7 días
          {rewards.data ? `: ${rewards.data.habit_percent}%` : ""}.
        </p>
        {rewards.error && <Alert>{rewards.error}</Alert>}
        <RewardsGrid rewards={habitRewards} onRedeemed={() => void rewards.reload()} />
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-[26px]">Retos gratuitos</h2>
        {challenges.error && <Alert>{challenges.error}</Alert>}
        {challenges.data && (
          <ChallengesPanel data={challenges.data} access="free" canParticipate onUpdate={challenges.setData} />
        )}
      </div>
    </>
  );
}

export function MiRutaPage() {
  const { session } = useAuth();

  return (
    <section className="py-[72px]">
      <div className="wrap flex flex-col gap-14">
        <SectionTitle eyebrow="GRATIS CON EL QR DE TU PRENDA" title="Mi Ruta S2">
          Rutinas, recetas y crecimiento personal para empezar hoy.
        </SectionTitle>

        <ContentTabs />

        {session ? (
          <SignedInWellness />
        ) : (
          <div className="card flex flex-col items-start gap-4 p-6 sm:p-9">
            <h2 className="text-[28px]">Mi panel de hábitos</h2>
            <p className="muted">Crea tu cuenta gratis para guardar tus hábitos, ver tu historial y desbloquear descuentos.</p>
            <div className="flex flex-wrap gap-3">
              <LinkButton to="/registro?next=/mi-ruta" variant="dark">Crear cuenta gratis</LinkButton>
              <LinkButton to="/ingresar?next=/mi-ruta">Ya tengo cuenta</LinkButton>
            </div>
          </div>
        )}

        <div className="flex flex-col items-start gap-3">
          <h2 className="text-[26px]">¿Quieres ir más lejos?</h2>
          <p className="muted">S2 Plus suma comunidad, rutinas personalizadas y recompensas reales.</p>
          <LinkButton to="/plus" variant="dark">Conocer S2 Plus</LinkButton>
        </div>
      </div>
    </section>
  );
}

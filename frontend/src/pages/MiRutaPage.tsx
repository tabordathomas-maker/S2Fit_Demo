import { Alert, Badge, LinkButton, SectionTitle, Spinner } from "../components/ui";
import { useAuth } from "../features/auth/AuthProvider";
import { challengesApi } from "../features/challenges/api";
import { ChallengesPanel } from "../features/challenges/ChallengesPanel";
import { RewardsGrid } from "../features/challenges/RewardsGrid";
import { ContentTabs } from "../features/content/ContentGrid";
import { MealsPanel } from "../features/content/MealsPanel";
import { MiRutaGate } from "../features/mi-ruta/MiRutaGate";
import { useMiRutaAccess } from "../features/mi-ruta/useMiRutaAccess";
import { HabitsPanel } from "../features/habits/HabitsPanel";
import { RoutinePanel } from "../features/routines/RoutinePanel";
import { useAsync } from "../services/useAsync";

function SignedInWellness() {
  const rewards = useAsync(() => challengesApi.rewards(), []);
  const challenges = useAsync(() => challengesApi.list(), []);
  const habitRewards = rewards.data?.rewards.filter((r) => r.kind === "habit_discount") ?? [];

  return (
    <>
      <RoutinePanel />

      <MealsPanel />

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
        <h2 className="text-[26px]">Retos</h2>
        {challenges.error && <Alert>{challenges.error}</Alert>}
        {challenges.data && (
          <ChallengesPanel data={challenges.data} canParticipate onUpdate={(next) => { challenges.setData(next); void rewards.reload(); }} />
        )}
      </div>
    </>
  );
}

export function MiRutaPage() {
  const access = useMiRutaAccess();

  if (access.loading) {
    return (
      <section className="py-[72px]">
        <div className="wrap"><Spinner /></div>
      </section>
    );
  }
  if (!access.hasAccess) return <MiRutaGate />;
  return <MiRutaContent />;
}

function MiRutaContent() {
  const { session } = useAuth();

  return (
    <section className="py-[72px]">
      <div className="wrap flex flex-col gap-14">
        <div className="flex flex-col items-start gap-3">
          <Badge tone="burgundy">Clientas S2</Badge>
          <SectionTitle eyebrow="CON EL CÓDIGO O QR DE TU COMPRA" title="Mi Ruta S2">
            Rutinas, recetas, retos y crecimiento personal para empezar hoy.
          </SectionTitle>
        </div>

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
      </div>
    </section>
  );
}

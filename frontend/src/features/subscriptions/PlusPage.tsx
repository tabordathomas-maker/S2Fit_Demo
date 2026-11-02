import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Alert, Badge, Button, Spinner } from "../../components/ui";
import { errorMessage } from "../../services/api";
import { formatCOP } from "../../services/format";
import type { MembershipStatus, Plan, SubscriptionRequestCreated } from "../../services/types";
import { useAsync } from "../../services/useAsync";
import { buildWhatsAppUrl, navigation } from "../../services/whatsapp";
import { useAuth } from "../auth/AuthProvider";
import { WhatsAppHandoff } from "../orders/WhatsAppHandoff";
import { PENDING_PLAN_KEY, subscriptionsApi } from "./api";
import { MembershipCard, needsRenewal } from "./MembershipCard";
import { PlusBenefitsArea } from "./PlusBenefitsArea";

const BENEFITS = [
  { t: "Retos de gym", d: "Retos progresivos que suben de nivel contigo." },
  { t: "Rutinas personalizadas", d: "Según tus necesidades y tus objetivos." },
  { t: "Comunidad S2", d: "Un espacio para avanzar acompañada y compartir tu proceso." },
  { t: "Seguimiento de hábitos", d: "Cumplimiento de metas medido por porcentajes." },
];

export function planPriceLabel(plan: Plan): string {
  return plan.price ? `${formatCOP(plan.price)} · ${plan.period_label}` : "Consulta el precio por WhatsApp";
}

function readPendingPlan(): string | null {
  try {
    return sessionStorage.getItem(PENDING_PLAN_KEY);
  } catch {
    return null;
  }
}

function writePendingPlan(code: string | null) {
  try {
    if (code) sessionStorage.setItem(PENDING_PLAN_KEY, code);
    else sessionStorage.removeItem(PENDING_PLAN_KEY);
  } catch {
    // Sin almacenamiento: la persona elegirá el plan de nuevo tras ingresar.
  }
}

export function PlusPage() {
  const { session, isAdmin } = useAuth();
  const navigate = useNavigate();
  const plans = useAsync(() => subscriptionsApi.plans(), []);
  const membership = useAsync<MembershipStatus | null>(
    () => (session ? subscriptionsApi.membership() : Promise.resolve(null)),
    [session?.user.id],
  );
  const whatsappUrl = buildWhatsAppUrl("Hola, quiero información sobre S2 Plus.");
  const [pendingPlan, setPendingPlan] = useState<string | null>(readPendingPlan);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<SubscriptionRequestCreated | null>(null);

  const subscribe = async (planCode: string) => {
    if (!session) {
      // Se conserva el plan elegido para continuar después de iniciar sesión.
      writePendingPlan(planCode);
      navigate(`/ingresar?next=${encodeURIComponent("/plus")}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // La solicitud se registra en el backend ANTES de abrir WhatsApp.
      const request = await subscriptionsApi.request(planCode);
      writePendingPlan(null);
      setPendingPlan(null);
      setCreated(request);
      void membership.reload();
      const url = buildWhatsAppUrl(request.whatsapp_message);
      if (url) navigation.redirect(url);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const status = membership.data;
  const isActive = Boolean(status?.is_active);
  const pendingPlanObj = plans.data?.find((p) => p.code === pendingPlan);
  const mainPlan = plans.data?.[0];
  const showSubscribe = !status?.subscription || needsRenewal(status.subscription);

  return (
    <>
      <section className="bg-burgundy py-[72px] text-cream">
        <div className="wrap flex max-w-[800px] flex-col items-start gap-[18px]">
          <span className="font-bold text-beige">SUSCRIPCIÓN</span>
          <h1 className="text-[clamp(34px,5vw,52px)]">S2 Plus</h1>
          <p className="text-[19px] leading-relaxed text-beige">
            Una comunidad más personalizada según tus necesidades y objetivos. Constancia que se recompensa de verdad.
          </p>
          {mainPlan && <p className="text-lg font-bold">Precio: {planPriceLabel(mainPlan)}</p>}
          {isActive && <Badge tone="beige">Tu membresía está activa</Badge>}
        </div>
      </section>

      <section className="py-[72px]">
        <div className="wrap flex flex-col gap-14">
          {created && (
            <WhatsAppHandoff
              title={created.already_existed ? "Ya tenías una solicitud pendiente" : "¡Solicitud registrada!"}
              reference={created.reference}
              message={created.whatsapp_message}
              detail="Acuerda el precio final, la vigencia y el medio de pago por WhatsApp. Activaremos tu membresía cuando verifiquemos el pago."
            />
          )}
          {error && <Alert>{error}</Alert>}

          {session && pendingPlanObj && !created && (
            <Alert tone="info">
              <div className="flex flex-wrap items-center gap-3">
                <span>Elegiste el plan <strong>{pendingPlanObj.name}</strong> antes de ingresar.</span>
                <Button variant="dark" disabled={busy} onClick={() => subscribe(pendingPlanObj.code)}>Continuar con mi suscripción</Button>
                <Button onClick={() => { writePendingPlan(null); setPendingPlan(null); }}>Descartar</Button>
              </div>
            </Alert>
          )}

          {session && membership.loading && <Spinner label="Consultando tu membresía…" />}
          {membership.error && <Alert>{membership.error}</Alert>}
          {status && (status.subscription || status.pending_request) && (
            <MembershipCard status={status} busy={busy} onRenew={(code) => subscribe(code)} />
          )}

          <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr))]">
            {BENEFITS.map((b) => (
              <div key={b.t} className="card flex flex-col gap-2.5">
                <h2 className="text-xl text-burgundy">{b.t}</h2>
                <p className="muted">{b.d}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-5">
            <h2 className="text-[28px]">Planes</h2>
            {plans.loading && <Spinner />}
            {plans.error && <Alert>{plans.error}</Alert>}
            {!plans.loading && !plans.error && plans.data?.length === 0 && (
              <div className="flex flex-col gap-3">
                <Alert tone="info">
                  <p>Pronto abriremos las suscripciones a S2 Plus. Escríbenos por WhatsApp para más información.</p>
                  {whatsappUrl && (
                    <a href={whatsappUrl} target="_blank" rel="noreferrer" className="font-bold text-burgundy underline">Escribir por WhatsApp</a>
                  )}
                </Alert>
                {isAdmin && (
                  <Alert tone="info">
                    No hay planes activos. Créalo en <Link to="/admin?tab=plus" className="font-bold text-burgundy underline">Admin → S2 Plus</Link>.
                  </Alert>
                )}
              </div>
            )}
            <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
              {plans.data?.map((plan) => (
                <article key={plan.id} className="card flex flex-col gap-4">
                  <h3 className="text-2xl">{plan.name}</h3>
                  {plan.description && <p className="muted">{plan.description}</p>}
                  <p className="text-xl font-bold text-burgundy">{planPriceLabel(plan)}</p>
                  <p className="text-sm text-muted">Vigencia: {plan.duration_days} días · renovación manual</p>
                  <ul className="list-inside list-disc text-sm">
                    {plan.benefits.map((b) => <li key={b}>{b}</li>)}
                  </ul>
                  {showSubscribe && !status?.pending_request && (
                    <Button variant="dark" disabled={busy} onClick={() => subscribe(plan.code)}>
                      {busy ? "Registrando…" : status?.subscription ? "Renovar" : "Suscribirme"}
                    </Button>
                  )}
                </article>
              ))}
            </div>
            <p className="text-sm text-muted">
              Al pulsar el botón registramos tu solicitud con una referencia y abrimos WhatsApp. Los pagos son manuales (transferencia, consignación u otro medio del convenio) y no hay cobros automáticos.
            </p>
          </div>

          <PlusBenefitsArea active={isActive} signedIn={Boolean(session)} />
        </div>
      </section>
    </>
  );
}

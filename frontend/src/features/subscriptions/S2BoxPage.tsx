import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { Alert, Badge, Button, Spinner } from "../../components/ui";
import { S2BOX, S2BOX_BOXES } from "../../content/s2box";
import { errorMessage } from "../../services/api";
import { formatCOP } from "../../services/format";
import type { MembershipStatus, Plan, SubscriptionRequestCreated } from "../../services/types";
import { useAsync } from "../../services/useAsync";
import { buildWhatsAppUrl, navigation } from "../../services/whatsapp";
import { useAuth } from "../auth/AuthProvider";
import { WhatsAppHandoff } from "../orders/WhatsAppHandoff";
import { BenefitIcon } from "../s2box/BenefitIcon";
import { MysteryBoxes } from "../s2box/MysteryBoxes";
import { PENDING_PLAN_KEY, subscriptionsApi } from "./api";
import { MembershipCard, needsRenewal } from "./MembershipCard";

const PLANS_ID = "planes";

export function planPriceLabel(plan: Plan): string {
  if (plan.hide_price) return "Precio por confirmar";
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

export function S2BoxPage() {
  const { session, isAdmin } = useAuth();
  const navigate = useNavigate();
  const plans = useAsync(() => subscriptionsApi.plans(), []);
  const membership = useAsync<MembershipStatus | null>(
    () => (session ? subscriptionsApi.membership() : Promise.resolve(null)),
    [session?.user.id],
  );
  const whatsappUrl = buildWhatsAppUrl("Hola, quiero información sobre S2 Box.");
  const [pendingPlan, setPendingPlan] = useState<string | null>(readPendingPlan);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<SubscriptionRequestCreated | null>(null);

  const subscribe = async (planCode: string) => {
    if (!session) {
      // Se conserva el plan elegido para continuar después de iniciar sesión.
      writePendingPlan(planCode);
      navigate(`/ingresar?next=${encodeURIComponent("/s2-box")}`);
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

  const location = useLocation();
  const [membershipNotice, setMembershipNotice] = useState(
    Boolean((location.state as { needMembership?: boolean } | null)?.needMembership),
  );
  const goToPlans = () => document.getElementById(PLANS_ID)?.scrollIntoView?.({ behavior: "smooth", block: "start" });

  const status = membership.data;
  const needMembership = () => {
    setMembershipNotice(true);
    goToPlans();
  };
  // Al volver desde una caja sin acceso, se baja a los planes.
  useEffect(() => {
    if (membershipNotice) goToPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const isActive = Boolean(status?.is_active);
  const pendingPlanObj = plans.data?.find((p) => p.code === pendingPlan);
  const mainPlan = plans.data?.[0];
  const showSubscribe = !status?.subscription || needsRenewal(status.subscription);

  return (
    <>
      <section className="bg-burgundy py-[72px] text-cream" aria-labelledby="box-title">
        <div className="wrap flex max-w-[800px] flex-col items-start gap-[18px]">
          <span className="font-bold tracking-wide text-beige">{S2BOX.brandPhrase.toUpperCase()}</span>
          <h1 id="box-title" className="text-[clamp(34px,5vw,52px)]">{S2BOX.name}</h1>
          <p className="font-display text-[clamp(20px,3vw,28px)] text-beige">{S2BOX.tagline}</p>
          <p className="text-[19px] leading-relaxed text-cream">{S2BOX.intro}</p>
          {mainPlan && <p className="text-lg font-bold">Precio: {planPriceLabel(mainPlan)}</p>}
          {isActive && <Badge tone="beige">Tu suscripción está activa</Badge>}
          <Button variant="light" onClick={goToPlans}>{S2BOX.cta}</Button>
        </div>
      </section>

      <section className="py-[72px]" aria-labelledby="benefits-title">
        <div className="wrap flex flex-col gap-8">
          <h2 id="benefits-title" className="text-[clamp(26px,3.5vw,36px)] text-burgundy">{S2BOX.benefitsTitle}</h2>
          <ul className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))]">
            {S2BOX.benefits.map((b) => (
              <li key={b.title} className="card flex flex-col gap-3 bg-cream">
                <span className="text-burgundy"><BenefitIcon name={b.icon} /></span>
                <h3 className="text-xl text-burgundy">{b.title}</h3>
                <p className="muted">{b.description}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <MysteryBoxes membership={{ loading: Boolean(session) && membership.loading, active: isActive }} onNeedMembership={needMembership} />

      <section id={PLANS_ID} className="py-[72px]" aria-labelledby="plans-title">
        <div className="wrap flex flex-col gap-8">
          {membershipNotice && !isActive && <Alert tone="info">{S2BOX_BOXES.needMembership}</Alert>}
          {created && (
            <WhatsAppHandoff
              title={created.already_existed ? "Ya tenías una solicitud pendiente" : "¡Solicitud registrada!"}
              reference={created.reference}
              message={created.whatsapp_message}
              detail="Acuerda el precio final, la vigencia y el medio de pago por WhatsApp. Activaremos tu suscripción cuando verifiquemos el pago."
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

          {session && membership.loading && <Spinner label="Consultando tu suscripción…" />}
          {membership.error && <Alert>{membership.error}</Alert>}
          {status && (status.subscription || status.pending_request) && (
            <MembershipCard status={status} busy={busy} onRenew={(code) => subscribe(code)} />
          )}

          <div className="flex flex-col gap-5">
            <h2 id="plans-title" className="text-[clamp(26px,3.5vw,36px)] text-burgundy">{S2BOX.plansTitle}</h2>
            {plans.loading && <Spinner />}
            {plans.error && <Alert>{plans.error}</Alert>}
            {!plans.loading && !plans.error && plans.data?.length === 0 && (
              <div className="flex flex-col gap-3">
                <Alert tone="info">
                  <p>Estamos definiendo los planes. Escríbenos por WhatsApp para apartar tu primera S2 Box.</p>
                  {whatsappUrl && (
                    <a href={whatsappUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center font-bold text-burgundy underline">Escribir por WhatsApp</a>
                  )}
                </Alert>
                {isAdmin && (
                  <Alert tone="info">
                    No hay planes activos. Créalo en <Link to="/admin?tab=s2box" className="font-bold text-burgundy underline">Admin → S2 Box</Link>.
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

          <p className="text-center text-sm text-muted">{S2BOX.note}</p>
        </div>
      </section>
    </>
  );
}

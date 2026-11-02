import { useEffect, useState, type FormEvent } from "react";

import { PhoneField } from "../components/PhoneField";
import { Alert, Button, Field, LinkButton, SectionTitle, Spinner } from "../components/ui";
import { useAuth } from "../features/auth/AuthProvider";
import { ordersApi } from "../features/orders/api";
import { subscriptionsApi } from "../features/subscriptions/api";
import { MembershipCard } from "../features/subscriptions/MembershipCard";
import { apiFetch, errorMessage } from "../services/api";
import { formatPhone, phoneForSubmit } from "../services/phone";
import { formatCOP, formatDateTime, paymentMethodLabel, paymentStatusLabel } from "../services/format";
import type { Profile } from "../services/types";
import { useAsync } from "../services/useAsync";

function ProfileForm() {
  const { profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(formatPhone(profile?.phone));
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    setFullName(profile?.full_name ?? "");
    setPhone(formatPhone(profile?.phone));
  }, [profile]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      await apiFetch<Profile>("/api/v1/me", { method: "PATCH", body: { full_name: fullName.trim() || null, phone: phoneForSubmit(phone) } });
      await refreshProfile();
      setMessage({ tone: "success", text: "Datos actualizados." });
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    }
  };

  return (
    <form onSubmit={save} className="card flex flex-col gap-4">
      <h2 className="text-2xl">Mi perfil</h2>
      <p className="text-sm text-muted">{profile?.email}</p>
      <Field label="Nombre completo" id="profile-name" value={fullName} onChange={(e) => setFullName(e.target.value)} minLength={2} />
      <PhoneField id="profile-phone" value={phone} onChange={setPhone} />
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Button type="submit" variant="dark" className="self-start">Guardar</Button>
    </form>
  );
}

export function AccountPage() {
  const { signOut } = useAuth();
  const membership = useAsync(() => subscriptionsApi.membership(), []);
  const payments = useAsync(() => ordersApi.payments(), []);

  return (
    <section className="py-[72px]">
      <div className="wrap flex flex-col gap-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionTitle title="Mi cuenta" />
          <div className="flex flex-wrap gap-3">
            <LinkButton to="/pedidos">Mis pedidos</LinkButton>
            <Button onClick={() => void signOut()}>Cerrar sesión</Button>
          </div>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-2">
          <ProfileForm />
          {membership.loading ? <Spinner /> : membership.error ? <Alert>{membership.error}</Alert> : membership.data && (
            membership.data.subscription || membership.data.pending_request ? (
              <div className="flex flex-col gap-3">
                <MembershipCard status={membership.data} />
                <LinkButton to="/plus" className="self-start">Ir a S2 Plus</LinkButton>
              </div>
            ) : (
              <div className="card flex flex-col items-start gap-3">
                <h2 className="text-2xl">Mi membresía</h2>
                <p className="muted">Aún no tienes S2 Plus.</p>
                <LinkButton to="/plus" variant="dark">Conocer S2 Plus</LinkButton>
              </div>
            )
          )}
        </div>

        <div className="card flex flex-col gap-4">
          <h2 className="text-2xl">Historial de pagos</h2>
          {payments.loading && <Spinner />}
          {payments.error && <Alert>{payments.error}</Alert>}
          {payments.data?.length === 0 && <p className="muted">Todavía no tienes pagos registrados.</p>}
          {payments.data && payments.data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-beige">
                    <th className="py-2">Referencia</th><th>Tipo</th><th>Importe</th><th>Medio</th><th>Estado</th><th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.data.map((p) => (
                    <tr key={p.id} className="border-b border-beige/60">
                      <td className="py-2 font-mono">{p.operation_reference}</td>
                      <td>{p.kind === "order" ? "Compra" : "S2 Plus"}</td>
                      <td>{p.amount ? formatCOP(p.amount) : "Por acordar"}</td>
                      <td>{p.method ? paymentMethodLabel[p.method] : "—"}</td>
                      <td>{paymentStatusLabel[p.status]}</td>
                      <td>{formatDateTime(p.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

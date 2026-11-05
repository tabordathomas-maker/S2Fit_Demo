import { useEffect, useState } from "react";

import { AuditEventCard } from "../../components/admin/AuditEventCard";
import { ClientAuditCard } from "../../components/admin/ClientAuditCard";
import { Alert, Badge, Button, Field, Pill, Select, Spinner } from "../../components/ui";
import { errorMessage } from "../../services/api";
import { downloadCsv } from "../../services/csv";
import { formatDateTime, plusStatusText } from "../../services/format";
import { formatPhone } from "../../services/phone";
import { useAsync } from "../../services/useAsync";
import { adminApi, type AuditClient, type AuditEvent } from "./api";

export function UsersAdmin() {
  const [q, setQ] = useState("");
  const profiles = useAsync(() => adminApi.profiles(q || undefined), [q]);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h3 className="text-2xl">Perfiles</h3>
        <p className="text-sm text-muted">
          Los roles no se cambian desde la web. Para nombrar administradores usa el script seguro descrito en el README.
        </p>
        <div className="max-w-sm">
          <label htmlFor="profile-q" className="label">Buscar por nombre, correo o celular</label>
          <input id="profile-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {profiles.loading && <Spinner />}
        {profiles.error && <Alert>{profiles.error}</Alert>}
        <div className="overflow-x-auto rounded-3xl bg-white p-4">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead><tr className="border-b border-beige"><th className="py-2">Nombre</th><th>Correo</th><th>Celular</th><th>Rol</th><th>S2 Box</th><th>Registro</th></tr></thead>
            <tbody>
              {profiles.data?.map((p) => (
                <tr key={p.id} className="border-b border-beige/60">
                  <td className="py-2">{p.full_name ?? "—"}</td><td>{p.email}</td><td>{p.phone ? formatPhone(p.phone) : "—"}</td>
                  <td><Badge tone={p.role === "admin" ? "burgundy" : "beige"}>{p.role}</Badge></td>
                  <td>{plusStatusText(p.plus_status, p.plus_ends_at)}</td>
                  <td>{formatDateTime(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <AuditSection />
    </div>
  );
}

const PAGE = 20;
const CATEGORIES = ["Pagos", "Pedidos", "Planes y S2 Box", "Contenido", "Catálogo", "Usuarios y membresías", "Archivos"];

function AuditSection() {
  const [view, setView] = useState<"clients" | "events">("clients");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [clients, setClients] = useState<AuditClient[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filters = (offset: number) => ({ from: from || undefined, to: to || undefined, q: q.trim() || undefined, category: view === "events" ? category || undefined : undefined, limit: PAGE, offset });

  const load = async (append: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const offset = append ? (view === "clients" ? clients.length : events.length) : 0;
      if (view === "clients") {
        const r = await adminApi.auditClients(filters(offset));
        setClients((prev) => (append ? [...prev, ...r.clients] : r.clients));
        setTotal(r.total);
      } else {
        const r = await adminApi.auditEvents(filters(offset));
        setEvents((prev) => (append ? [...prev, ...r.events] : r.events));
        setTotal(r.total);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => void load(false), q ? 300 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, from, to, q, category]);

  const shown = view === "clients" ? clients.length : events.length;

  const exportCsv = () => {
    if (view === "clients") {
      const rows: (string | number | null)[][] = [["Cliente", "Correo", "Celular", "Referencia", "Tipo", "Monto", "Estado", "Última actualización"]];
      for (const c of clients) {
        for (const o of c.orders) rows.push([c.name, c.email, c.phone, o.reference, "Pedido", o.total, `${o.status?.label ?? ""} / pago ${o.payment?.label ?? "—"}`, o.events[0]?.when ?? c.last_activity]);
        for (const r of c.requests) rows.push([c.name, c.email, c.phone, r.reference, "Suscripción", r.agreed_price, `${r.status?.label ?? ""} / pago ${r.payment?.label ?? "—"}`, r.events[0]?.when ?? c.last_activity]);
      }
      downloadCsv("auditoria-clientes.csv", rows);
    } else {
      const rows: (string | number | null)[][] = [["Fecha", "Hora", "Admin", "Categoría", "Entidad", "Acción", "Detalle"]];
      for (const e of events) {
        const [date, time] = e.when.split(", ").length === 2 ? e.when.split(", ") : [e.when, ""];
        rows.push([date, time, e.admin, e.category, `${e.entity.type} · ${e.entity.name}`, e.phrase, e.changes.map((c) => `${c.field}: ${c.before} → ${c.after}`).join(" | ")]);
      }
      downloadCsv("auditoria-registro.csv", rows);
    }
  };

  return (
    <section className="flex flex-col gap-4" aria-label="Auditoría">
      <h3 className="text-2xl">Auditoría</h3>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Vista de la auditoría">
        <Pill active={view === "clients"} onClick={() => setView("clients")}>Clientes</Pill>
        <Pill active={view === "events"} onClick={() => setView("events")}>Todo el registro</Pill>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
        <Field label="Desde" id="audit-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Field label="Hasta" id="audit-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <Field label="Buscar" id="audit-q" placeholder="Nombre, correo, celular o referencia" value={q} onChange={(e) => setQ(e.target.value)} />
        {view === "events" && (
          <Select label="Categoría" id="audit-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Todas</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={exportCsv} disabled={shown === 0}>Exportar CSV</Button>
        <span className="text-sm text-muted">{shown} de {total}</span>
      </div>
      {loading && shown === 0 && <Spinner />}
      {error && <Alert>{error}</Alert>}
      {!loading && !error && shown === 0 && (
        <p className="muted">{view === "clients" ? "No hay actividad de clientes con estos filtros." : "No hay eventos con estos filtros."}</p>
      )}
      <ul className="grid gap-4 md:grid-cols-2">
        {view === "clients" ? clients.map((c) => <ClientAuditCard key={c.id} client={c} />) : events.map((e) => <AuditEventCard key={e.id} event={e} />)}
      </ul>
      {shown < total && <Button className="self-start" disabled={loading} onClick={() => void load(true)}>Cargar más</Button>}
    </section>
  );
}

import { useState } from "react";

import { Alert, Badge, Spinner } from "../../components/ui";
import { formatDateTime } from "../../services/format";
import { useAsync } from "../../services/useAsync";
import { adminApi } from "./api";

export function UsersAdmin() {
  const [q, setQ] = useState("");
  const profiles = useAsync(() => adminApi.profiles(q || undefined), [q]);
  const logs = useAsync(() => adminApi.auditLogs(), []);

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
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead><tr className="border-b border-beige"><th className="py-2">Nombre</th><th>Correo</th><th>Celular</th><th>Rol</th><th>Registro</th></tr></thead>
            <tbody>
              {profiles.data?.map((p) => (
                <tr key={p.id} className="border-b border-beige/60">
                  <td className="py-2">{p.full_name ?? "—"}</td><td>{p.email}</td><td>{p.phone ?? "—"}</td>
                  <td><Badge tone={p.role === "admin" ? "burgundy" : "beige"}>{p.role}</Badge></td>
                  <td>{formatDateTime(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="text-2xl">Auditoría</h3>
        {logs.loading && <Spinner />}
        {logs.error && <Alert>{logs.error}</Alert>}
        <ul className="flex flex-col gap-2">
          {logs.data?.map((log) => (
            <li key={log.id} className="rounded-2xl bg-white p-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <strong className="font-mono">{log.action}</strong>
                <span className="text-muted">{formatDateTime(log.created_at)} · {log.admin_email}</span>
              </div>
              <span>{log.entity_type} {log.entity_id}</span>
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-xs text-muted">{JSON.stringify(log.details)}</pre>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

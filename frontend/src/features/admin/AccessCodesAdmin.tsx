import { useEffect, useRef, useState, type FormEvent } from "react";
import { QRCodeCanvas } from "qrcode.react";

import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { useNotice } from "../../components/admin/useNotice";
import { PhoneField } from "../../components/PhoneField";
import { Badge, Button, Field, Select, Spinner } from "../../components/ui";
import { config } from "../../config";
import { ApiError } from "../../services/api";
import { formatDate, formatDateTime } from "../../services/format";
import { accessLink } from "../../services/miRutaAccess";
import { formatPhone, phoneForSubmit } from "../../services/phone";
import { useAsync } from "../../services/useAsync";
import { adminApi, type AccessCode } from "./api";

const STATUS: Record<AccessCode["status"], { label: string; tone: "green" | "gray" | "red" }> = {
  active: { label: "Activo", tone: "green" },
  inactive: { label: "Inactivo", tone: "gray" },
  expired: { label: "Vencido", tone: "red" },
};

const QR_PIXELS = 256;

const linkOf = (code: string) => accessLink(code, window.location.origin, config.baseUrl);

/** Fin del día elegido en hora local, para que el código valga todo ese día. */
function endOfDay(value: string): string | null {
  return value ? new Date(`${value}T23:59:59`).toISOString() : null;
}

/** Pestaña «Códigos y QR»: genera, imprime y administra los códigos que dan acceso a Mi Ruta. */
export function AccessCodesAdmin() {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const codes = useAsync(() => adminApi.accessCodes(debouncedQ || undefined, statusFilter || undefined), [debouncedQ, statusFilter]);
  const { notice, success, fail: failNotice, clear } = useNotice();
  // Los mensajes propios (cantidad, celular, ventanas emergentes) se muestran tal cual.
  const fail = (err: unknown) => failNotice(err instanceof Error && !(err instanceof ApiError) ? new ApiError(422, "validation_error", err.message) : err);
  const canvases = useRef<Record<string, HTMLCanvasElement | null>>({});
  const [toDelete, setToDelete] = useState<AccessCode | null>(null);
  const [busy, setBusy] = useState(false);

  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [phone, setPhone] = useState("");
  const [expires, setExpires] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [q]);

  const generate = async (e: FormEvent) => {
    e.preventDefault();
    clear();
    const amount = Number(quantity);
    if (!Number.isInteger(amount) || amount < 1 || amount > 50) {
      fail(new Error("Elige entre 1 y 50 códigos."));
      return;
    }
    setCreating(true);
    try {
      const created = await adminApi.createAccessCodes({
        quantity: amount,
        note: note.trim() || null,
        phone: phoneForSubmit(phone),
        expires_at: endOfDay(expires),
      });
      success(created.length === 1 ? `Código ${created[0].code} generado.` : `${created.length} códigos generados.`);
      setNote("");
      setPhone("");
      setExpires("");
      await codes.reload();
    } catch (err) {
      fail(err);
    } finally {
      setCreating(false);
    }
  };

  const run = async (action: () => Promise<unknown>, message: string) => {
    clear();
    setBusy(true);
    try {
      await action();
      success(message);
      await codes.reload();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const download = (code: AccessCode) => {
    const canvas = canvases.current[code.code];
    if (!canvas) return;
    const anchor = document.createElement("a");
    anchor.href = canvas.toDataURL("image/png");
    anchor.download = `S2-MiRuta-${code.code}.png`;
    anchor.click();
  };

  const print = (code: AccessCode) => {
    const canvas = canvases.current[code.code];
    if (!canvas) return;
    const popup = window.open("", "_blank", "width=480,height=680");
    if (!popup) {
      fail(new Error("Permite las ventanas emergentes para imprimir."));
      return;
    }
    // El código solo tiene letras y números; la imagen es un data URL generado aquí.
    popup.document.write(
      `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>S2-MiRuta-${code.code}</title>` +
        `<style>body{font-family:sans-serif;text-align:center;padding:32px}img{width:280px;height:280px}` +
        `.code{font-size:56px;font-weight:700;letter-spacing:8px;margin:16px 0}p{font-size:20px}</style></head><body>` +
        `<img src="${canvas.toDataURL("image/png")}" alt="QR de Mi Ruta"><div class="code">${code.code}</div>` +
        `<p>Escanéame para entrar a Mi Ruta S2</p></body></html>`,
    );
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const copy = async (code: AccessCode) => {
    clear();
    try {
      await navigator.clipboard.writeText(linkOf(code.code));
      success(`Enlace del código ${code.code} copiado.`);
    } catch {
      fail(new Error("No se pudo copiar. Copia el enlace a mano."));
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const target = toDelete;
    setToDelete(null);
    await run(() => adminApi.deleteAccessCode(target.id), `Código ${target.code} eliminado.`);
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4" aria-label="Generar códigos">
        <h3 className="text-2xl">Generar códigos</h3>
        <p className="text-sm text-muted">
          Para ventas fuera de la página (ferias, WhatsApp, local). Cada código abre Mi Ruta sin cuenta; al crear una cuenta queda ligado a ella.
        </p>
        <form onSubmit={generate} className="grid gap-4 rounded-3xl bg-white p-4 sm:grid-cols-2" noValidate>
          <Field label="Cantidad (1 a 50)" id="code-quantity" type="number" min={1} max={50} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          <Field label="Nota (cliente o venta, opcional)" id="code-note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          <PhoneField id="code-phone" label="Celular (opcional)" hint="Solo para saber a quién se lo diste." value={phone} onChange={setPhone} />
          <Field label="Vence el (opcional)" id="code-expires" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          <div className="sm:col-span-2">
            <Button type="submit" variant="dark" disabled={creating}>{creating ? "Generando…" : "Generar códigos"}</Button>
          </div>
        </form>
      </section>

      {notice}

      <section className="flex flex-col gap-4" aria-label="Códigos generados">
        <h3 className="text-2xl">Códigos</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Buscar por código o nota" id="code-q" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select label="Estado" id="code-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
            <option value="expired">Vencidos</option>
          </Select>
        </div>
        {codes.loading && <Spinner />}
        {codes.error && <p role="alert" className="text-red-700">{codes.error}</p>}
        {codes.data?.length === 0 && !codes.loading && <p className="muted">No hay códigos con esos filtros.</p>}
        <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(320px,100%),1fr))]">
          {codes.data?.map((c) => (
            <li key={c.id} className="flex flex-col gap-3 rounded-3xl bg-white p-4" aria-label={`Código ${c.code}`}>
              <div className="flex items-start gap-4">
                <QRCodeCanvas
                  ref={(el) => { canvases.current[c.code] = el; }}
                  value={linkOf(c.code)}
                  size={QR_PIXELS}
                  marginSize={2}
                  role="img"
                  aria-label={`QR del código ${c.code}`}
                  style={{ width: 96, height: 96 }}
                  className="shrink-0"
                />
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="font-mono text-2xl font-bold tracking-[0.2em]">{c.code}</span>
                  <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge>
                  {c.note && <span className="text-sm">{c.note}</span>}
                  {c.phone && <span className="text-sm text-muted">{formatPhone(c.phone)}</span>}
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted">Cuenta vinculada</dt><dd>{c.linked_email ?? "—"}</dd>
                <dt className="text-muted">Usos</dt><dd>{c.used_count}</dd>
                <dt className="text-muted">Último uso</dt><dd>{c.last_used_at ? formatDateTime(c.last_used_at) : "—"}</dd>
                <dt className="text-muted">Vence</dt><dd>{c.expires_at ? formatDate(c.expires_at) : "Sin vencimiento"}</dd>
              </dl>
              <div className="flex flex-wrap gap-2" role="group" aria-label={`Acciones del código ${c.code}`}>
                <Button aria-label={`Descargar QR ${c.code}`} onClick={() => download(c)}>Descargar PNG</Button>
                <Button aria-label={`Imprimir ${c.code}`} onClick={() => print(c)}>Imprimir</Button>
                <Button aria-label={`Copiar enlace ${c.code}`} onClick={() => void copy(c)}>Copiar enlace</Button>
                <Button
                  aria-label={`${c.is_active ? "Desactivar" : "Activar"} ${c.code}`}
                  disabled={busy}
                  onClick={() => void run(() => adminApi.updateAccessCode(c.id, { is_active: !c.is_active }), `Código ${c.code} ${c.is_active ? "desactivado" : "activado"}.`)}
                >
                  {c.is_active ? "Desactivar" : "Activar"}
                </Button>
                {c.used_count === 0 && !c.linked_email && (
                  <Button aria-label={`Eliminar ${c.code}`} disabled={busy} onClick={() => setToDelete(c)}>Eliminar</Button>
                )}
              </div>
              {(c.used_count > 0 || c.linked_email) && <p className="text-xs text-muted">Ya se usó: solo se puede desactivar.</p>}
            </li>
          ))}
        </ul>
      </section>

      <ConfirmDialog
        open={toDelete !== null}
        title="Eliminar código"
        message={`¿Eliminar el código ${toDelete?.code ?? ""}? Nunca se usó, así que se borra del todo.`}
        confirmLabel="Eliminar"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

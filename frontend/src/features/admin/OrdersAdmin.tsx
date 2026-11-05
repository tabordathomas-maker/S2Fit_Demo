import { useState } from "react";

import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { DeleteDialog } from "../../components/admin/DeleteDialog";
import { RowActions } from "../../components/admin/RowActions";
import { Alert, Badge, Button, Select, Spinner, TextArea } from "../../components/ui";
import { errorMessage } from "../../services/api";
import { formatCOP, formatDateTime, orderStatusLabel, paymentStatusLabel } from "../../services/format";
import { useAsync } from "../../services/useAsync";
import { adminApi, type AdminOrder } from "./api";
import { OrderEditor } from "./OrderEditor";

/** Un pedido solo se elimina si no tiene pago confirmado. */
const DELETABLE = new Set(["pending_payment", "cancelled", "expired"]);

export function OrdersAdmin() {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const orders = useAsync(() => adminApi.orders(status || undefined, q || undefined), [status, q]);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminOrder | null>(null);
  const [cancelling, setCancelling] = useState<AdminOrder | null>(null);
  const [reason, setReason] = useState("");

  const run = async (fn: () => Promise<unknown>, success: string) => {
    setMessage(null);
    try {
      await fn();
      setMessage({ tone: "success", text: success });
      await orders.reload();
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    }
  };

  const sweep = () =>
    run(async () => {
      const r = await adminApi.expireReservations();
      setMessage({ tone: "success", text: `${r.expired_orders} pedido(s) con reserva vencida liberados.` });
    }, "");

  const renew = (o: AdminOrder) => run(() => adminApi.renewReservation(o.id), `Reserva de ${o.reference} renovada.`);
  const confirmCancel = async () => {
    const order = cancelling;
    if (!order) return;
    const text = reason.trim();
    setCancelling(null);
    setReason("");
    await run(() => adminApi.cancelOrder(order.id, text || undefined), `Pedido ${order.reference} cancelado.`);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <Select label="Estado" id="order-status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos</option>
          {Object.entries(orderStatusLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <div>
          <label htmlFor="order-q" className="label">Referencia</label>
          <input id="order-q" className="input" placeholder="S2-ORD-…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button onClick={sweep}>Liberar reservas vencidas</Button>
      </div>
      {message?.text && <Alert tone={message.tone}>{message.text}</Alert>}
      {orders.loading && <Spinner />}
      {orders.error && <Alert>{orders.error}</Alert>}
      <ul className="flex flex-col gap-4">
        {orders.data?.map((o) => {
          const expired = new Date(o.reservation_expires_at) < new Date() && o.reservation_status === "active";
          return (
            <li key={o.id} className="card flex flex-col gap-2 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-lg font-bold">{o.reference}</span>
                <Badge tone={o.status === "paid" ? "green" : o.status === "pending_payment" ? "beige" : "red"}>{orderStatusLabel[o.status]}</Badge>
              </div>
              <p className="text-sm">{o.customer_name ?? "—"} · {o.customer_email}</p>
              <ul className="text-sm">
                {o.items.map((i) => <li key={i.variant_id}>{i.quantity} × {i.product_name} ({i.variant_label}, {i.sku}) — {formatCOP(i.line_total)}</li>)}
              </ul>
              <p className="font-bold">Total {formatCOP(o.total)} · Pago: {o.payment ? paymentStatusLabel[o.payment.status] : "—"}</p>
              <p className="text-sm text-muted">
                Creado {formatDateTime(o.created_at)} · Reserva: {o.reservation_status} hasta {formatDateTime(o.reservation_expires_at)}
                {expired && <strong className="text-red-700"> (vencida)</strong>}
              </p>
              {o.customer_note && <p className="text-sm">Nota: {o.customer_note}</p>}
              {(o.status === "pending_payment" || o.status === "expired") && (
                <div className="flex flex-wrap gap-2">
                  {(expired || o.status === "expired") && <Button variant="dark" onClick={() => renew(o)}>Renovar reserva</Button>}
                  <Button aria-label={`Cancelar pedido ${o.reference}`} onClick={() => setCancelling(o)}>Cancelar pedido</Button>
                </div>
              )}
              {editing === o.id ? (
                <OrderEditor
                  order={o}
                  onClose={() => setEditing(null)}
                  onSaved={async () => {
                    setEditing(null);
                    setMessage({ tone: "success", text: `Pedido ${o.reference} actualizado.` });
                    await orders.reload();
                  }}
                />
              ) : (
                <RowActions
                  name={o.reference}
                  onEdit={() => setEditing(o.id)}
                  onDelete={DELETABLE.has(o.status) ? () => setDeleting(o) : undefined}
                />
              )}
            </li>
          );
        })}
      </ul>
      <DeleteDialog
        target={deleting ? { name: deleting.reference } : null}
        noun="pedido"
        remove={() => adminApi.deleteOrder(deleting!.id)}
        onClose={() => setDeleting(null)}
        onDone={() => {
          setMessage({ tone: "success", text: `Pedido ${deleting?.reference} eliminado y su reserva liberada.` });
          setDeleting(null);
          void orders.reload();
        }}
      />
      <ConfirmDialog
        open={cancelling !== null}
        title="Cancelar pedido"
        confirmLabel="Cancelar pedido"
        cancelLabel="Volver"
        message={
          <div className="flex flex-col gap-3">
            <p>Se cancelará {cancelling?.reference} y se liberará su reserva de inventario.</p>
            <TextArea label="Motivo (opcional)" id="cancel-reason" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        }
        onConfirm={() => void confirmCancel()}
        onCancel={() => { setCancelling(null); setReason(""); }}
      />
    </div>
  );
}

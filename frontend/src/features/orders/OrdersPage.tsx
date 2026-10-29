import { useState } from "react";

import { Alert, Badge, Button, LinkButton, SectionTitle, Spinner } from "../../components/ui";
import { errorMessage } from "../../services/api";
import { formatCOP, formatDateTime, orderStatusLabel, paymentStatusLabel } from "../../services/format";
import type { Order } from "../../services/types";
import { useAsync } from "../../services/useAsync";
import { buildWhatsAppUrl, navigation } from "../../services/whatsapp";
import { ordersApi } from "./api";

const tone = (status: string) =>
  status === "paid" ? "green" : status === "pending_payment" ? "beige" : status === "refunded" ? "gray" : "red";

export function OrdersPage() {
  const orders = useAsync(() => ordersApi.list(), []);
  const [actionError, setActionError] = useState<string | null>(null);

  const contact = async (order: Order) => {
    setActionError(null);
    try {
      const detail = await ordersApi.get(order.reference);
      const url = buildWhatsAppUrl(detail.whatsapp_message);
      if (url) navigation.redirect(url);
      else setActionError(`El número de WhatsApp no está configurado. Tu referencia es ${order.reference}.`);
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  const cancel = async (order: Order) => {
    if (!window.confirm(`¿Cancelar el pedido ${order.reference}?`)) return;
    setActionError(null);
    try {
      await ordersApi.cancel(order.reference);
      await orders.reload();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  return (
    <section className="py-[72px]">
      <div className="wrap flex flex-col gap-8">
        <SectionTitle title="Mis pedidos">Consulta el estado de tus compras y del pago acordado por WhatsApp.</SectionTitle>
        {orders.loading && <Spinner />}
        {orders.error && <Alert>{orders.error}</Alert>}
        {actionError && <Alert>{actionError}</Alert>}
        {orders.data?.length === 0 && (
          <div className="card flex flex-col items-start gap-4">
            <p className="muted">Aún no tienes pedidos.</p>
            <LinkButton to="/tienda" variant="dark">Ir a la tienda</LinkButton>
          </div>
        )}
        <ul className="flex flex-col gap-4">
          {orders.data?.map((order) => (
            <li key={order.id} className="card flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-mono text-lg">{order.reference}</h2>
                <Badge tone={tone(order.status)}>{orderStatusLabel[order.status]}</Badge>
              </div>
              <p className="text-sm text-muted">Creado: {formatDateTime(order.created_at)}</p>
              <ul className="text-sm">
                {order.items.map((i) => (
                  <li key={i.variant_id}>{i.quantity} × {i.product_name} ({i.variant_label}) — {formatCOP(i.line_total)}</li>
                ))}
              </ul>
              <p className="font-bold">Total: {formatCOP(order.total)}</p>
              {order.payment && <p className="text-sm">Pago: {paymentStatusLabel[order.payment.status]}</p>}
              {order.status === "pending_payment" && (
                <>
                  <p className="text-sm text-muted">Reserva válida hasta {formatDateTime(order.reservation_expires_at)}.</p>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="dark" onClick={() => contact(order)}>Escribir por WhatsApp</Button>
                    <Button onClick={() => cancel(order)}>Cancelar pedido</Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Alert, Button, LinkButton, SectionTitle } from "../../components/ui";
import { errorMessage } from "../../services/api";
import { formatCOP } from "../../services/format";
import type { OrderWithMessage } from "../../services/types";
import { buildWhatsAppUrl, navigation } from "../../services/whatsapp";
import { useAuth } from "../auth/AuthProvider";
import { ProductImage } from "../catalog/ProductImage";
import { ordersApi } from "../orders/api";
import { WhatsAppHandoff } from "../orders/WhatsAppHandoff";
import { useCart } from "./CartProvider";

export function CartPage() {
  const { lines, estimatedTotal, setQuantity, remove, clear } = useCart();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderWithMessage | null>(null);

  const checkout = async () => {
    if (!session) {
      navigate(`/ingresar?next=${encodeURIComponent("/carrito")}`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // 1) El backend valida existencias, calcula precios y crea la referencia.
      const created = await ordersApi.create(
        lines.map((l) => ({ variant_id: l.variantId, quantity: l.quantity })),
        note,
      );
      clear();
      setOrder(created);
      // 2) Solo con la referencia ya guardada se abre WhatsApp.
      const url = buildWhatsAppUrl(created.whatsapp_message);
      if (url) navigation.redirect(url);
    } catch (err) {
      // Si falla la creación no se redirige a WhatsApp.
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (order) {
    return (
      <section className="py-[72px]">
        <div className="wrap max-w-3xl">
          <WhatsAppHandoff
            title="¡Pedido creado!"
            reference={order.reference}
            message={order.whatsapp_message}
            note="Tu prenda llegará con su QR para Mi Ruta."
            detail={`Total: ${formatCOP(order.total)}. Reservamos tus prendas mientras acordamos el pago por WhatsApp.`}
          />
          <div className="mt-6 flex flex-wrap gap-3">
            <LinkButton to="/pedidos" variant="outline">Ver mis pedidos</LinkButton>
            <LinkButton to="/tienda" variant="outline">Seguir comprando</LinkButton>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-[72px]">
      <div className="wrap flex flex-col gap-8">
        <SectionTitle title="Tu bolsa" />
        {lines.length === 0 ? (
          <div className="card flex flex-col items-start gap-4">
            <p className="muted">Tu bolsa está vacía.</p>
            <LinkButton to="/tienda" variant="dark">Ver la tienda</LinkButton>
          </div>
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
            <ul className="flex flex-col gap-4" aria-label="Productos en la bolsa">
              {lines.map((line) => (
                <li key={line.variantId} className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                  <ProductImage src={line.imageUrl} alt={line.productName} className="w-24 shrink-0 rounded-2xl" />
                  <div className="flex-1">
                    <Link to={`/tienda/${line.productSlug}`} className="font-display text-lg">{line.productName}</Link>
                    <p className="muted">{line.variantLabel}</p>
                    <p className="font-bold text-burgundy">{formatCOP(line.displayPrice)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="sr-only" htmlFor={`qty-${line.variantId}`}>Cantidad de {line.productName}</label>
                    <input
                      id={`qty-${line.variantId}`}
                      type="number"
                      min={1}
                      max={Math.min(10, line.maxQuantity)}
                      value={line.quantity}
                      onChange={(e) => setQuantity(line.variantId, Number(e.target.value) || 1)}
                      className="input w-20"
                    />
                    <Button onClick={() => remove(line.variantId)} aria-label={`Quitar ${line.productName}`}>Quitar</Button>
                  </div>
                </li>
              ))}
            </ul>

            <aside className="card flex flex-col gap-4" aria-label="Resumen del pedido">
              <h2 className="text-2xl">Resumen</h2>
              <div className="flex justify-between text-lg">
                <span>Total estimado</span>
                <strong className="text-burgundy">{formatCOP(estimatedTotal)}</strong>
              </div>
              <p className="text-sm text-muted">
                El total final lo confirma el sistema al crear el pedido, con los precios y existencias vigentes. El envío y el pago se acuerdan por WhatsApp.
              </p>
              <div>
                <label htmlFor="note" className="label">Nota para la tienda (opcional)</label>
                <textarea id="note" maxLength={500} className="input min-h-20" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              {error && <Alert>{error}</Alert>}
              <Button variant="dark" onClick={checkout} disabled={submitting}>
                {submitting ? "Creando pedido…" : "Comprar por WhatsApp"}
              </Button>
              {!session && <p className="text-sm text-muted">Te pediremos iniciar sesión para asociar el pedido a tu cuenta.</p>}
            </aside>
          </div>
        )}
      </div>
    </section>
  );
}

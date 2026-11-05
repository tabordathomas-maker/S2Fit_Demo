import { useState } from "react";

import { diffPatch } from "../../components/admin/patch";
import { Alert, Button, Select, TextArea } from "../../components/ui";
import { errorMessage } from "../../services/api";
import { useAsync } from "../../services/useAsync";
import { adminApi, type AdminOrder } from "./api";

interface Line {
  variant_id: number;
  quantity: number;
  label: string;
}

/**
 * Edición de un pedido. Pendiente: nota y productos. Con pago confirmado (o cancelado/vencido): solo la nota;
 * el backend responde 409 ORDER_LOCKED si se intenta cambiar los productos de todos modos.
 */
export function OrderEditor({ order, onSaved, onClose }: { order: AdminOrder; onSaved: (order: AdminOrder) => void; onClose: () => void }) {
  const itemsEditable = order.status === "pending_payment";
  const initial = {
    customer_note: order.customer_note ?? "",
    items: order.items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity })),
  };
  const [note, setNote] = useState(initial.customer_note);
  const [lines, setLines] = useState<Line[]>(
    order.items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity, label: `${i.product_name} (${i.variant_label})` })),
  );
  const [newVariant, setNewVariant] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const products = useAsync(async () => (itemsEditable ? adminApi.products() : []), [itemsEditable]);

  const variants = (products.data ?? []).flatMap((p) =>
    p.variants.filter((v) => v.is_active).map((v) => ({ id: v.id, label: `${p.name} (Talla ${v.size} · ${v.color}) — ${v.available} disp.` })),
  );

  const setQuantity = (variantId: number, quantity: number) =>
    setLines((all) => all.map((l) => (l.variant_id === variantId ? { ...l, quantity } : l)));

  const addLine = () => {
    const id = Number(newVariant);
    if (!id || lines.some((l) => l.variant_id === id)) return;
    const found = variants.find((v) => v.id === id);
    setLines((all) => [...all, { variant_id: id, quantity: 1, label: found?.label.split(" — ")[0] ?? `Variante ${id}` }]);
    setNewVariant("");
  };

  const save = async () => {
    const current = { customer_note: note.trim(), items: lines.map((l) => ({ variant_id: l.variant_id, quantity: l.quantity })) };
    const changes = diffPatch(initial, current);
    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    const body: Parameters<typeof adminApi.updateOrder>[1] = {};
    if ("customer_note" in changes) body.customer_note = current.customer_note || null;
    if ("items" in changes) body.items = current.items;
    setSaving(true);
    setError(null);
    try {
      onSaved(await adminApi.updateOrder(order.id, body));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="flex flex-col gap-3 rounded-2xl border-2 border-beige p-4" aria-label={`Editar ${order.reference}`} onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <h4 className="text-xl">Editar {order.reference}</h4>
      {itemsEditable ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="label">Productos</legend>
          {lines.map((l) => (
            <div key={l.variant_id} className="flex flex-wrap items-center gap-2">
              <span className="min-w-[200px] flex-1">{l.label}</span>
              <input
                type="number" min={1} max={10} className="input w-24" aria-label={`Cantidad de ${l.label}`}
                value={l.quantity} onChange={(e) => setQuantity(l.variant_id, Number(e.target.value))}
              />
              <Button aria-label={`Quitar ${l.label}`} disabled={lines.length === 1} onClick={() => setLines((all) => all.filter((x) => x.variant_id !== l.variant_id))}>Quitar</Button>
            </div>
          ))}
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1">
              <Select label="Agregar producto" id="order-add-variant" value={newVariant} onChange={(e) => setNewVariant(e.target.value)}>
                <option value="">Elegir talla…</option>
                {variants.filter((v) => !lines.some((l) => l.variant_id === v.id)).map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </Select>
            </div>
            <Button disabled={!newVariant} onClick={addLine}>Agregar</Button>
          </div>
          <p className="text-sm text-muted">Al guardar se ajusta la reserva de inventario y se recalcula el total.</p>
        </fieldset>
      ) : (
        <p className="text-sm text-muted">Este pedido ya no admite cambios en sus productos; solo puedes editar la nota.</p>
      )}
      <TextArea label="Nota" id={`order-note-${order.id}`} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center rounded-full border-2 border-burgundy bg-burgundy px-6 py-2.5 font-bold text-cream disabled:opacity-50">Guardar cambios</button>
        <Button onClick={onClose}>Cancelar edición</Button>
      </div>
    </form>
  );
}

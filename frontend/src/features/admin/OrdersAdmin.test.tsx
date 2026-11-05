import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ApiError } from "../../services/api";
import { renderWithProviders } from "../../test/utils";
import { adminApi, type AdminOrder } from "./api";
import { OrdersAdmin } from "./OrdersAdmin";

const order = (id: string, extra: Partial<AdminOrder> = {}): AdminOrder => ({
  id, reference: `S2-ORD-${id}`, status: "pending_payment", subtotal: 100000, total: 100000, reservation_status: "active",
  reservation_expires_at: "2099-01-01T00:00:00Z", customer_note: "Llamar antes", created_at: "2026-11-03T15:00:00Z",
  paid_at: null, cancelled_at: null, user_id: "u1", customer_email: "laura@example.com", customer_name: "Laura Gómez",
  items: [{ variant_id: 7, product_name: "Set azul", variant_label: "Talla M · Lila", sku: "SKU-7", unit_price: 100000, quantity: 1, line_total: 100000 }],
  payment: { status: "pending", amount: 100000, method: null, decided_at: null },
  ...extra,
});

const paid = order("PAID", { status: "paid", reservation_status: "consumed", paid_at: "2026-11-03T16:00:00Z", payment: { status: "confirmed", amount: 100000, method: "transfer", decided_at: "2026-11-03T16:00:00Z" } });

describe("OrdersAdmin · editar, cancelar y eliminar", () => {
  beforeEach(() => {
    vi.spyOn(adminApi, "products").mockResolvedValue([]);
  });
  afterEach(() => vi.restoreAllMocks());

  it("el formulario de edición se precarga y envía PATCH solo con lo cambiado", async () => {
    vi.spyOn(adminApi, "orders").mockResolvedValue([order("A")]);
    const update = vi.spyOn(adminApi, "updateOrder").mockResolvedValue(order("A"));
    renderWithProviders(<OrdersAdmin />);

    await userEvent.click(await screen.findByRole("button", { name: "Editar S2-ORD-A" }));
    expect(screen.getByLabelText("Nota")).toHaveValue("Llamar antes");
    expect(screen.getByLabelText("Cantidad de Set azul (Talla M · Lila)")).toHaveValue(1);
    const quantity = screen.getByLabelText("Cantidad de Set azul (Talla M · Lila)");
    await userEvent.clear(quantity);
    await userEvent.type(quantity, "3");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(update).toHaveBeenCalledWith("A", { items: [{ variant_id: 7, quantity: 3 }] }));
    expect(await screen.findByText("Pedido S2-ORD-A actualizado.")).toBeInTheDocument();
  });

  it("muestra el error 409 STOCK_INSUFFICIENT del backend dentro del formulario", async () => {
    vi.spyOn(adminApi, "orders").mockResolvedValue([order("A")]);
    vi.spyOn(adminApi, "updateOrder").mockRejectedValue(new ApiError(409, "STOCK_INSUFFICIENT", "Solo quedan 2 unidades de Set azul."));
    renderWithProviders(<OrdersAdmin />);

    await userEvent.click(await screen.findByRole("button", { name: "Editar S2-ORD-A" }));
    const quantity = screen.getByLabelText("Cantidad de Set azul (Talla M · Lila)");
    await userEvent.clear(quantity);
    await userEvent.type(quantity, "9");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByText("Solo quedan 2 unidades de Set azul.")).toBeInTheDocument();
  });

  it("eliminar pide confirmación, llama a DELETE y la fila desaparece", async () => {
    const orders = vi.spyOn(adminApi, "orders").mockResolvedValueOnce([order("A"), order("B")]).mockResolvedValue([order("B")]);
    const remove = vi.spyOn(adminApi, "deleteOrder").mockResolvedValue(undefined);
    renderWithProviders(<OrdersAdmin />);

    await userEvent.click(await screen.findByRole("button", { name: "Eliminar S2-ORD-A" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(remove).toHaveBeenCalledWith("A"));
    await waitFor(() => expect(screen.queryByText("S2-ORD-A")).not.toBeInTheDocument());
    expect(screen.getByText("S2-ORD-B")).toBeInTheDocument();
    expect(orders).toHaveBeenCalledTimes(2);
  });

  it("cancelar un pedido acepta un motivo opcional", async () => {
    vi.spyOn(adminApi, "orders").mockResolvedValue([order("A")]);
    const cancel = vi.spyOn(adminApi, "cancelOrder").mockResolvedValue(order("A", { status: "cancelled" }));
    renderWithProviders(<OrdersAdmin />);

    await userEvent.click(await screen.findByRole("button", { name: "Cancelar pedido S2-ORD-A" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar pedido" }));

    await waitFor(() => expect(cancel).toHaveBeenCalledWith("A", undefined));
  });

  it("un pedido pagado no muestra edición de ítems ni botón eliminar", async () => {
    vi.spyOn(adminApi, "orders").mockResolvedValue([paid]);
    renderWithProviders(<OrdersAdmin />);

    expect(screen.queryByRole("button", { name: "Eliminar S2-ORD-PAID" })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Editar S2-ORD-PAID" }));

    expect(screen.queryByRole("button", { name: "Eliminar S2-ORD-PAID" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Cantidad de/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Quitar/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Nota")).toBeInTheDocument();
  });
});

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "../../test/utils";
import { ApiError } from "../../services/api";
import { adminApi, type AdminPayment } from "./api";
import { PaymentsAdmin } from "./PaymentsAdmin";

const payment: AdminPayment = {
  id: "p1", kind: "subscription", status: "pending", amount: 60000, method: null, operation_reference: "S2P-0001",
  created_at: "2026-11-03T15:00:00Z", decided_at: null, user_id: "u1", customer_email: "laura@example.com",
  customer_name: "Laura Gómez", customer_phone: "3001234567", order_id: null, subscription_request_id: "r1",
  plan_name: "S2 Box mensual", subscription_ends_at: null, external_reference: null, admin_notes: null,
  decided_by: null, decided_by_email: null, reservation_expires_at: null, reservation_status: null,
};

async function fillAndConfirm() {
  await userEvent.click(await screen.findByRole("button", { name: "Confirmar pago" }));
  await userEvent.type(screen.getByLabelText("Importe recibido (COP)"), "60000");
  await userEvent.type(screen.getByLabelText("Referencia en el convenio"), "CONV-123");
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(screen.getAllByRole("button", { name: "Confirmar pago" })[1]);
}

describe("PaymentsAdmin · pagos de S2 Box", () => {
  afterEach(() => vi.restoreAllMocks());

  it("tras confirmar muestra el mensaje con la fecha y el enlace a S2 Box", async () => {
    vi.spyOn(adminApi, "payments").mockResolvedValueOnce([payment]).mockResolvedValue([]);
    vi.spyOn(adminApi, "confirmPayment").mockResolvedValue({ ...payment, status: "confirmed", subscription_ends_at: "2026-12-03T15:00:00Z" });
    renderWithProviders(<PaymentsAdmin />);

    await fillAndConfirm();

    expect(await screen.findByText("Pago confirmado. S2 Box de Laura Gómez activa hasta 3 dic 2026.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver en S2 Box" })).toHaveAttribute("href", "/admin?tab=s2box");
  });

  it("un error al confirmar se ve dentro de la tarjeta del pago", async () => {
    vi.spyOn(adminApi, "payments").mockResolvedValue([payment]);
    vi.spyOn(adminApi, "confirmPayment").mockRejectedValue(new ApiError(409, "agreed_terms_missing", "Falta el precio acordado."));
    renderWithProviders(<PaymentsAdmin />);

    await fillAndConfirm();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Falta el precio acordado.");
    expect(alert.closest("li")).toHaveTextContent("S2P-0001");
  });

  it("sin precio acordado, Confirmar pago está deshabilitado y se pide registrarlo", async () => {
    vi.spyOn(adminApi, "payments").mockResolvedValue([{ ...payment, amount: null }]);
    renderWithProviders(<PaymentsAdmin />);

    expect(await screen.findByRole("button", { name: "Confirmar pago" })).toBeDisabled();
    expect(screen.getByText("Primero registra el precio acordado.")).toBeInTheDocument();
    expect(screen.getByLabelText("Precio acordado (COP)")).toBeInTheDocument();
  });

  it("Marcar en revisión aclara que no activa la membresía", async () => {
    vi.spyOn(adminApi, "payments").mockResolvedValue([payment]);
    renderWithProviders(<PaymentsAdmin />);

    expect(await screen.findByText(/no activa la membresía/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Marcar en revisión" })).toHaveAttribute("title", expect.stringContaining("no activa")));
  });
});

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ApiError } from "../../services/api";
import type { Plan } from "../../services/types";
import { renderWithProviders } from "../../test/utils";
import { adminApi, type AdminSubscription, type AdminSubscriptionRequest } from "./api";
import { MembershipsAdmin } from "./MembershipsAdmin";

const plan = (id: number, name: string, extra: Partial<Plan> = {}): Plan => ({
  id, code: `plan-${id}`, name, description: null, price: 60000, duration_days: 30, period_label: "mensual", benefits: ["Retos"], is_active: true, ...extra,
});

const request: AdminSubscriptionRequest = {
  id: "r1", reference: "S2-SUB-0001", kind: "new", status: "pending_payment", plan: plan(1, "S2 Box mensual"), agreed_price: 60000,
  agreed_duration_days: 30, created_at: "2026-11-03T15:00:00Z", user_id: "u1", customer_email: "laura@example.com", customer_name: "Laura Gómez",
  payment_id: "p1", payment_status: "pending",
};

const sub: AdminSubscription = {
  id: "s1", status: "active", plan: plan(1, "S2 Box mensual"), starts_at: "2099-01-01T15:00:00Z", ends_at: "2099-02-01T15:00:00Z",
  amount_paid: 60000, last_payment_reference: "CONV-1", renewals: [], user_id: "u1", customer_email: "laura@example.com",
  customer_name: "Laura Gómez", customer_phone: null,
};

describe("MembershipsAdmin · CRUD de S2 Box", () => {
  beforeEach(() => {
    vi.spyOn(adminApi, "plans").mockResolvedValue([plan(1, "S2 Box mensual")]);
    vi.spyOn(adminApi, "subscriptionRequests").mockResolvedValue([request]);
    vi.spyOn(adminApi, "subscriptions").mockResolvedValue([sub]);
    vi.spyOn(adminApi, "profiles").mockResolvedValue([]);
  });
  afterEach(() => vi.restoreAllMocks());

  it("editar un plan lo precarga y el PATCH solo lleva lo cambiado", async () => {
    const update = vi.spyOn(adminApi, "updatePlan").mockResolvedValue(plan(1, "S2 Box mensual", { price: 70000 }));
    renderWithProviders(<MembershipsAdmin />);

    const price = await screen.findByLabelText("Precio (COP)");
    expect(price).toHaveValue("60.000");
    expect(screen.getByLabelText("Nombre", { selector: "#pn-1" })).toHaveValue("S2 Box mensual");
    await userEvent.clear(price);
    await userEvent.type(price, "70000");
    await userEvent.click(screen.getByRole("button", { name: "Guardar plan" }));

    await waitFor(() => expect(update).toHaveBeenCalledWith(1, { price: 70000 }));
  });

  it("un plan con solicitudes responde 409: muestra el mensaje y archiva en su lugar", async () => {
    const message = "Este plan tiene 1 solicitud y 1 suscripción. Puedes archivarlo para que deje de ofrecerse en S2 Box.";
    vi.spyOn(adminApi, "deletePlan").mockRejectedValue(new ApiError(409, "RESOURCE_IN_USE", message, { requests: 1 }));
    const archive = vi.spyOn(adminApi, "archivePlan").mockResolvedValue(plan(1, "S2 Box mensual", { is_active: false }));
    renderWithProviders(<MembershipsAdmin />);

    await userEvent.click(await screen.findByRole("button", { name: "Eliminar S2 Box mensual" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Eliminar" }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Archivar en su lugar" }));

    await waitFor(() => expect(archive).toHaveBeenCalledWith(1));
  });

  it("«Mostrar archivados» muestra y oculta los planes archivados", async () => {
    vi.spyOn(adminApi, "plans").mockImplementation(async (includeArchived) =>
      includeArchived ? [plan(1, "S2 Box mensual"), plan(2, "Plan viejo", { is_active: false })] : [plan(1, "S2 Box mensual")]);
    renderWithProviders(<MembershipsAdmin />);
    await screen.findByLabelText("Nombre", { selector: "#pn-1" });
    expect(screen.queryByLabelText("Nombre", { selector: "#pn-2" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("switch", { name: "Mostrar archivados" }));
    expect(await screen.findByLabelText("Nombre", { selector: "#pn-2" })).toHaveValue("Plan viejo");
    expect(screen.getByRole("button", { name: "Restaurar Plan viejo" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("switch", { name: "Mostrar archivados" }));
    await waitFor(() => expect(screen.queryByLabelText("Nombre", { selector: "#pn-2" })).not.toBeInTheDocument());
  });

  it("editar una solicitud pendiente envía solo el precio cambiado", async () => {
    const update = vi.spyOn(adminApi, "updateSubscriptionRequest").mockResolvedValue(request);
    renderWithProviders(<MembershipsAdmin />);

    await userEvent.click(await screen.findByRole("button", { name: "Editar S2-SUB-0001" }));
    const price = screen.getByLabelText("Precio acordado (COP)");
    expect(price).toHaveValue(60000);
    await userEvent.clear(price);
    await userEvent.type(price, "55000");
    await userEvent.click(screen.getByRole("button", { name: "Guardar solicitud" }));

    await waitFor(() => expect(update).toHaveBeenCalledWith("r1", { agreed_price: 55000 }));
  });

  it("eliminar una solicitud → confirmación → DELETE → la fila desaparece", async () => {
    vi.spyOn(adminApi, "subscriptionRequests").mockResolvedValueOnce([request]).mockResolvedValue([]);
    const remove = vi.spyOn(adminApi, "deleteSubscriptionRequest").mockResolvedValue(undefined);
    renderWithProviders(<MembershipsAdmin />);

    await userEvent.click(await screen.findByRole("button", { name: "Eliminar S2-SUB-0001" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(remove).toHaveBeenCalledWith("r1"));
    await waitFor(() => expect(screen.queryByText("S2-SUB-0001")).not.toBeInTheDocument());
  });

  it("editar fechas de la membresía envía solo la fecha de fin cambiada", async () => {
    const update = vi.spyOn(adminApi, "updateSubscription").mockResolvedValue(sub);
    renderWithProviders(<MembershipsAdmin />);

    await userEvent.click(await screen.findByRole("button", { name: /Editar fechas de Laura Gómez/ }));
    const ends = screen.getByLabelText("Vence");
    expect(ends).toHaveValue("2099-02-01");
    await userEvent.clear(ends);
    await userEvent.type(ends, "2099-03-01");
    await userEvent.click(screen.getByRole("button", { name: "Guardar fechas" }));

    await waitFor(() => expect(update).toHaveBeenCalledWith("s1", { ends_at: "2099-03-01T15:00:00Z" }));
  });
});

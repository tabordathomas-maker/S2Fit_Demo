import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { customerProfile, renderWithProviders } from "../../test/utils";
import type { AdminMembership, AdminProfile, Plan } from "../../services/types";
import { adminApi, type AdminSubscription } from "./api";
import { MembershipsAdmin } from "./MembershipsAdmin";

const laura: AdminProfile = {
  ...customerProfile, id: "u-laura", full_name: "Laura Gómez", email: "laura@example.com", phone: "3001234567",
  plus_status: "none", plus_ends_at: null,
};
const plan = { id: 1, code: "plus-mensual", name: "S2 Box mensual", description: null, price: null, duration_days: 30, period_label: "mensual", benefits: [], is_active: true } as Plan;
const none: AdminMembership = { status: "none", plan_name: null, starts_at: null, ends_at: null, is_active: false };

function future(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

describe("MembershipsAdmin · activar S2 Box manualmente", () => {
  beforeEach(() => {
    vi.spyOn(adminApi, "plans").mockResolvedValue([plan]);
    vi.spyOn(adminApi, "subscriptionRequests").mockResolvedValue([]);
    vi.spyOn(adminApi, "subscriptions").mockResolvedValue([]);
    vi.spyOn(adminApi, "profiles").mockResolvedValue([laura]);
    vi.spyOn(adminApi, "membership").mockResolvedValue(none);
  });
  afterEach(() => vi.restoreAllMocks());

  it("no tiene la galería de la caja y avisa que las cajas se crean en la pestaña Cajas S2 Box", async () => {
    renderWithProviders(<MembershipsAdmin />);

    expect(await screen.findByText(/Las cajas misteriosas \(portada, contenido y reclamos\) se crean en la pestaña Cajas S2 Box/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ir a Cajas S2 Box" })).toBeInTheDocument();
    expect(screen.queryByText("Galería de la caja")).not.toBeInTheDocument();
    expect(screen.queryByText(/Subir imagen/)).not.toBeInTheDocument();
  });

  it("al buscar a una persona muestra su estado de S2 Box", async () => {
    vi.mocked(adminApi.profiles).mockResolvedValue([
      laura,
      { ...laura, id: "u-ana", full_name: "Ana Ruiz", email: "ana@example.com", plus_status: "expired", plus_ends_at: "2026-11-02T15:00:00Z" },
    ]);
    renderWithProviders(<MembershipsAdmin />);

    await userEvent.type(screen.getByLabelText("Busca a una persona por nombre, correo o celular"), "a");

    await waitFor(() => expect(adminApi.profiles).toHaveBeenCalledWith("a"));
    expect(await screen.findByText("Sin S2 Box")).toBeInTheDocument();
    expect(screen.getByText("Vencida el 2 nov 2026")).toBeInTheDocument();
    expect(screen.getByText(/laura@example.com · 300 123 4567/)).toBeInTheDocument();
  });

  it("con 90 días y motivo Cortesía, confirma, llama al endpoint y muestra el éxito", async () => {
    const grant = vi.spyOn(adminApi, "grantMembership").mockResolvedValue({ ...none, status: "active", is_active: true, ends_at: "2026-12-02T15:00:00Z" });
    renderWithProviders(<MembershipsAdmin />);

    await userEvent.click(await screen.findByRole("button", { name: /Laura Gómez/ }));
    await userEvent.click(await screen.findByRole("button", { name: "90 días" }));
    await userEvent.click(screen.getByRole("button", { name: "Cortesía" }));
    expect(screen.getByText(/Quedará activa desde hoy hasta el/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Activar S2 Box" }));
    expect(grant).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Sí, confirmar" }));

    await waitFor(() => expect(grant).toHaveBeenCalledWith("u-laura", 90, "Cortesía"));
    expect(await screen.findByText("S2 Box activa para Laura hasta el 2 dic 2026")).toBeInTheDocument();
    expect(adminApi.membership).toHaveBeenCalledTimes(2);
  });

  it("sin motivo no envía y muestra el error", async () => {
    const grant = vi.spyOn(adminApi, "grantMembership");
    renderWithProviders(<MembershipsAdmin />);

    await userEvent.click(await screen.findByRole("button", { name: /Laura Gómez/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Activar S2 Box" }));

    expect(await screen.findByText(/Escribe el motivo/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sí, confirmar" })).not.toBeInTheDocument();
    expect(grant).not.toHaveBeenCalled();
  });

  it("si la persona está activa ofrece extender y explica la fecha resultante", async () => {
    const ends = future(10);
    vi.mocked(adminApi.membership).mockResolvedValue({ ...none, status: "active", is_active: true, ends_at: ends, plan_name: "S2 Box mensual" });
    renderWithProviders(<MembershipsAdmin />);

    await userEvent.click(await screen.findByRole("button", { name: /Laura Gómez/ }));

    expect(await screen.findByRole("button", { name: "Extender S2 Box" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar S2 Box" })).toBeInTheDocument();
    expect(screen.getByText(/Se extenderá desde el .* hasta el /)).toBeInTheDocument();
  });

  it("sin planes activos muestra el aviso de crear un plan en vez del formulario", async () => {
    vi.mocked(adminApi.plans).mockResolvedValue([{ ...plan, is_active: false }]);
    renderWithProviders(<MembershipsAdmin />);

    expect(await screen.findByText("Primero crea un plan en esta misma pestaña (sección Planes).")).toBeInTheDocument();
    expect(screen.queryByLabelText("Busca a una persona por nombre, correo o celular")).not.toBeInTheDocument();
  });
});

function sub(over: Partial<AdminSubscription>): AdminSubscription {
  return {
    id: "s1", status: "active", plan, starts_at: "2026-11-01T15:00:00Z", ends_at: future(30), amount_paid: 60000,
    last_payment_reference: "CONV-1", renewals: [], user_id: "u-laura", customer_email: "laura@example.com",
    customer_name: "Laura Gómez", customer_phone: "3001234567", ...over,
  };
}

describe("MembershipsAdmin · membresías", () => {
  beforeEach(() => {
    vi.spyOn(adminApi, "plans").mockResolvedValue([plan]);
    vi.spyOn(adminApi, "subscriptionRequests").mockResolvedValue([]);
    vi.spyOn(adminApi, "profiles").mockResolvedValue([]);
    vi.spyOn(adminApi, "subscriptions").mockResolvedValue([
      sub({}),
      sub({ id: "s2", status: "expired", customer_name: "Ana Ruiz", customer_email: "ana@example.com" }),
      sub({ id: "s3", ends_at: future(3), customer_name: "Eva Soto", customer_email: "eva@example.com" }),
    ]);
  });
  afterEach(() => vi.restoreAllMocks());

  it("muestra la cuenta de activas y filtra por estado", async () => {
    renderWithProviders(<MembershipsAdmin />);

    expect(await screen.findByText("Membresías activas (2)")).toBeInTheDocument();
    expect(screen.getByText("Laura Gómez")).toBeInTheDocument();
    expect(screen.getAllByText(/300 123 4567/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Ana Ruiz")).not.toBeInTheDocument();
    expect(screen.getByText(/vence en 3 días/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Por vencer en 7 días" }));
    expect(screen.getByText("Eva Soto")).toBeInTheDocument();
    expect(screen.queryByText("Laura Gómez")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Vencidas" }));
    expect(screen.getByText("Ana Ruiz")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Todas" }));
    expect(screen.getByText("Laura Gómez")).toBeInTheDocument();
    expect(screen.getByText("Ana Ruiz")).toBeInTheDocument();
  });

  it("Actualizar vuelve a pedir los datos", async () => {
    renderWithProviders(<MembershipsAdmin />);
    await screen.findByText("Membresías activas (2)");
    expect(adminApi.subscriptions).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Actualizar" }));

    await waitFor(() => expect(adminApi.subscriptions).toHaveBeenCalledTimes(2));
    expect(adminApi.subscriptionRequests).toHaveBeenCalledTimes(2);
    expect(adminApi.plans).toHaveBeenCalledTimes(2);
  });

  it("cancelar pide el motivo en pantalla, sin window.prompt", async () => {
    const prompt = vi.spyOn(window, "prompt");
    const cancel = vi.spyOn(adminApi, "cancelSubscription").mockResolvedValue(sub({ status: "cancelled" }));
    renderWithProviders(<MembershipsAdmin />);

    await userEvent.click((await screen.findAllByRole("button", { name: "Cancelar membresía" }))[0]);
    await userEvent.type(screen.getByLabelText("Motivo de la cancelación"), "ab");
    await userEvent.click(screen.getByRole("button", { name: "Sí, cancelar membresía" }));
    expect(cancel).not.toHaveBeenCalled();
    expect(await screen.findByText(/mínimo 3 letras/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Motivo de la cancelación"), "c");
    await userEvent.click(screen.getByRole("button", { name: "Sí, cancelar membresía" }));

    await waitFor(() => expect(cancel).toHaveBeenCalledWith("s1", "abc"));
    expect(prompt).not.toHaveBeenCalled();
  });
});

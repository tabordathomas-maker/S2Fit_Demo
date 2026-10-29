import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { config } from "../../config";
import { ApiError } from "../../services/api";
import type { MembershipStatus, Plan, SubscriptionRequestCreated } from "../../services/types";
import { navigation } from "../../services/whatsapp";
import { renderWithProviders, signedInAuth } from "../../test/utils";
import { PENDING_PLAN_KEY, subscriptionsApi } from "./api";
import { PlusPage } from "./PlusPage";

const plan: Plan = {
  id: 1, code: "plus-mensual", name: "S2 Plus mensual", description: null, price: null,
  duration_days: 30, period_label: "mensual", benefits: ["Retos"], is_active: true,
};
const noMembership: MembershipStatus = { is_active: false, subscription: null, pending_request: null };

describe("PlusPage", () => {
  beforeEach(() => {
    config.whatsappNumber = "573001234567";
    vi.spyOn(subscriptionsApi, "plans").mockResolvedValue([plan]);
    vi.spyOn(subscriptionsApi, "membership").mockResolvedValue(noMembership);
  });
  afterEach(() => vi.restoreAllMocks());

  it("muestra «Consulta el precio por WhatsApp» cuando el plan no tiene precio", async () => {
    renderWithProviders(<PlusPage />);
    expect(await screen.findAllByText("Consulta el precio por WhatsApp")).not.toHaveLength(0);
  });

  it("sin sesión guarda el plan elegido y lleva a ingresar", async () => {
    const request = vi.spyOn(subscriptionsApi, "request");
    renderWithProviders(<PlusPage />, { route: "/plus", path: "/plus" });

    await userEvent.click(await screen.findByRole("button", { name: "Suscribirme" }));

    expect(await screen.findByText("Página de ingreso")).toBeInTheDocument();
    expect(sessionStorage.getItem(PENDING_PLAN_KEY)).toBe("plus-mensual");
    expect(request).not.toHaveBeenCalled();
  });

  it("con sesión registra la solicitud y después abre WhatsApp con la referencia", async () => {
    const created = {
      id: "r1", reference: "S2-SUB-QWER2345", kind: "new", status: "pending_payment", plan,
      agreed_price: null, agreed_duration_days: null, created_at: "", already_existed: false,
      whatsapp_message: "Hola, quiero suscribirme a S2 Plus. Elegí el plan S2 Plus mensual. Mi referencia de solicitud es S2-SUB-QWER2345.",
    } as SubscriptionRequestCreated;
    const request = vi.spyOn(subscriptionsApi, "request").mockResolvedValue(created);
    const redirect = vi.spyOn(navigation, "redirect").mockImplementation(() => {});
    renderWithProviders(<PlusPage />, { auth: signedInAuth() });

    await userEvent.click(await screen.findByRole("button", { name: "Suscribirme" }));

    await waitFor(() => expect(redirect).toHaveBeenCalled());
    expect(request).toHaveBeenCalledWith("plus-mensual");
    expect(decodeURIComponent(redirect.mock.calls[0][0])).toContain("S2-SUB-QWER2345");
  });

  it("si la API falla no abre WhatsApp", async () => {
    vi.spyOn(subscriptionsApi, "request").mockRejectedValue(new ApiError(0, "network_error", "No pudimos conectar con el servidor."));
    const redirect = vi.spyOn(navigation, "redirect").mockImplementation(() => {});
    renderWithProviders(<PlusPage />, { auth: signedInAuth() });

    await userEvent.click(await screen.findByRole("button", { name: "Suscribirme" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos conectar");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("retoma el plan guardado después de iniciar sesión", async () => {
    sessionStorage.setItem(PENDING_PLAN_KEY, "plus-mensual");
    renderWithProviders(<PlusPage />, { auth: signedInAuth() });
    expect(await screen.findByRole("button", { name: "Continuar con mi suscripción" })).toBeInTheDocument();
  });

  it("una solicitud pendiente no desbloquea el área exclusiva", async () => {
    vi.spyOn(subscriptionsApi, "membership").mockResolvedValue({
      is_active: false,
      subscription: null,
      pending_request: { id: "r1", reference: "S2-SUB-PEND2345", kind: "new", status: "pending_payment", plan, agreed_price: null, agreed_duration_days: null, created_at: "" },
    });
    renderWithProviders(<PlusPage />, { auth: signedInAuth() });

    expect(await screen.findByText(/S2-SUB-PEND2345/)).toBeInTheDocument();
    expect(screen.getByText("Área exclusiva S2 Plus")).toBeInTheDocument();
    expect(screen.queryByText("Alimentación diaria")).not.toBeInTheDocument();
  });
});

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { config } from "../../config";
import { ApiError } from "../../services/api";
import type { MembershipStatus, Plan, SubscriptionRequestCreated } from "../../services/types";
import { navigation } from "../../services/whatsapp";
import { customerProfile, renderWithProviders, signedInAuth } from "../../test/utils";
import { S2BOX } from "../../content/s2box";
import { s2boxApi, type MysteryBoxCover } from "../s2box/api";
import { PENDING_PLAN_KEY, subscriptionsApi } from "./api";
import { S2BoxPage } from "./S2BoxPage";

const plan: Plan = {
  id: 1, code: "plus-mensual", name: "S2 Box mensual", description: null, price: null,
  duration_days: 30, period_label: "mensual", benefits: ["Retos"], is_active: true,
};
const noMembership: MembershipStatus = { is_active: false, subscription: null, pending_request: null };

describe("S2BoxPage", () => {
  beforeEach(() => {
    config.whatsappNumber = "573001234567";
    vi.spyOn(subscriptionsApi, "plans").mockResolvedValue([plan]);
    vi.spyOn(subscriptionsApi, "membership").mockResolvedValue(noMembership);
    vi.spyOn(s2boxApi, "boxes").mockResolvedValue([]);
  });
  afterEach(() => vi.restoreAllMocks());

  it("muestra «Consulta el precio por WhatsApp» cuando el plan no tiene precio", async () => {
    renderWithProviders(<S2BoxPage />);
    expect(await screen.findAllByText("Consulta el precio por WhatsApp")).not.toHaveLength(0);
  });

  it("sin sesión guarda el plan elegido y lleva a ingresar", async () => {
    const request = vi.spyOn(subscriptionsApi, "request");
    renderWithProviders(<S2BoxPage />, { route: "/s2-box", path: "/s2-box" });

    await userEvent.click(await screen.findByRole("button", { name: "Suscribirme" }));

    expect(await screen.findByText("Página de ingreso")).toBeInTheDocument();
    expect(sessionStorage.getItem(PENDING_PLAN_KEY)).toBe("plus-mensual");
    expect(request).not.toHaveBeenCalled();
  });

  it("con sesión registra la solicitud y después abre WhatsApp con la referencia", async () => {
    const created = {
      id: "r1", reference: "S2-SUB-QWER2345", kind: "new", status: "pending_payment", plan,
      agreed_price: null, agreed_duration_days: null, created_at: "", already_existed: false,
      whatsapp_message: "Hola, quiero suscribirme a S2 Box. Elegí el plan S2 Box mensual. Mi referencia de solicitud es S2-SUB-QWER2345.",
    } as SubscriptionRequestCreated;
    const request = vi.spyOn(subscriptionsApi, "request").mockResolvedValue(created);
    const redirect = vi.spyOn(navigation, "redirect").mockImplementation(() => {});
    renderWithProviders(<S2BoxPage />, { auth: signedInAuth() });

    await userEvent.click(await screen.findByRole("button", { name: "Suscribirme" }));

    await waitFor(() => expect(redirect).toHaveBeenCalled());
    expect(request).toHaveBeenCalledWith("plus-mensual");
    expect(decodeURIComponent(redirect.mock.calls[0][0])).toContain("S2-SUB-QWER2345");
  });

  it("si la API falla no abre WhatsApp", async () => {
    vi.spyOn(subscriptionsApi, "request").mockRejectedValue(new ApiError(0, "network_error", "No pudimos conectar con el servidor."));
    const redirect = vi.spyOn(navigation, "redirect").mockImplementation(() => {});
    renderWithProviders(<S2BoxPage />, { auth: signedInAuth() });

    await userEvent.click(await screen.findByRole("button", { name: "Suscribirme" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos conectar");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("retoma el plan guardado después de iniciar sesión", async () => {
    sessionStorage.setItem(PENDING_PLAN_KEY, "plus-mensual");
    renderWithProviders(<S2BoxPage />, { auth: signedInAuth() });
    expect(await screen.findByRole("button", { name: "Continuar con mi suscripción" })).toBeInTheDocument();
  });

  it("descarta en silencio un plan guardado cuyo código ya no existe", async () => {
    sessionStorage.setItem(PENDING_PLAN_KEY, "plus-anual-viejo");
    renderWithProviders(<S2BoxPage />, { auth: signedInAuth() });

    await screen.findByRole("heading", { name: "S2 Box mensual" });
    await waitFor(() => expect(sessionStorage.getItem(PENDING_PLAN_KEY)).toBeNull());
    expect(screen.queryByRole("button", { name: "Continuar con mi suscripción" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("una solicitud pendiente muestra su referencia", async () => {
    vi.spyOn(subscriptionsApi, "membership").mockResolvedValue({
      is_active: false,
      subscription: null,
      pending_request: { id: "r1", reference: "S2-SUB-PEND2345", kind: "new", status: "pending_payment", plan, agreed_price: null, agreed_duration_days: null, created_at: "" },
    });
    renderWithProviders(<S2BoxPage />, { auth: signedInAuth() });

    expect(await screen.findByText(/S2-SUB-PEND2345/)).toBeInTheDocument();
  });

  it("sin planes avisa que se están definiendo y ofrece WhatsApp", async () => {
    vi.spyOn(subscriptionsApi, "plans").mockResolvedValue([]);
    renderWithProviders(<S2BoxPage />);

    expect(await screen.findByText(/Estamos definiendo los planes/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Escribir por WhatsApp" })).toHaveAttribute("href", expect.stringContaining("wa.me/573001234567"));
    expect(screen.queryByText(/No hay planes activos/)).not.toBeInTheDocument();
  });

  it("sin planes, el administrador ve además el enlace al panel", async () => {
    vi.spyOn(subscriptionsApi, "plans").mockResolvedValue([]);
    renderWithProviders(<S2BoxPage />, { auth: signedInAuth({ ...customerProfile, role: "admin" }) });

    expect(await screen.findByText(/No hay planes activos/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Admin → S2 Box" })).toHaveAttribute("href", "/admin?tab=s2box");
  });

  describe("secciones de S2 Box", () => {
    it("muestra el hero, los beneficios y la sección de planes", async () => {
      renderWithProviders(<S2BoxPage />);

      expect(screen.getByRole("heading", { level: 1, name: "S2 Box" })).toBeInTheDocument();
      expect(screen.getByText(S2BOX.tagline)).toBeInTheDocument();
      expect(screen.getByText(S2BOX.intro)).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "¿Qué trae tu S2 Box?" })).toBeInTheDocument();
      for (const b of S2BOX.benefits) {
        expect(screen.getByRole("heading", { name: b.title })).toBeInTheDocument();
        expect(screen.getByText(b.description)).toBeInTheDocument();
      }
      expect(await screen.findByRole("heading", { name: "S2 Box mensual" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Planes" })).toBeInTheDocument();
      expect(screen.getByText(S2BOX.note)).toBeInTheDocument();
    });

    it("ya no muestra la galería «Así se ve tu caja»", async () => {
      renderWithProviders(<S2BoxPage />);

      await screen.findByRole("heading", { name: "S2 Box mensual" });
      expect(screen.queryByText("Así se ve tu caja")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Ampliar imagen/ })).not.toBeInTheDocument();
    });

    it("muestra las cajas cuando la API las devuelve, entre los beneficios y los planes", async () => {
      const box: MysteryBoxCover = {
        id: 5, title: "Caja Soul", teaser: "Una sorpresa", cover_url: "https://x.supabase.co/s2box/a.jpg",
        cover_alt: "Caja cerrada", content_access: "free",
      } as MysteryBoxCover;
      vi.spyOn(s2boxApi, "boxes").mockResolvedValue([box]);
      renderWithProviders(<S2BoxPage />);

      const boxTitle = await screen.findByRole("heading", { name: "Caja Soul" });
      const benefits = screen.getByRole("heading", { name: "¿Qué trae tu S2 Box?" });
      const plans = screen.getByRole("heading", { name: "Planes" });
      expect(benefits.compareDocumentPosition(boxTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(boxTitle.compareDocumentPosition(plans) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });
});

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { config } from "../../config";
import { ApiError } from "../../services/api";
import type { MembershipStatus, Plan, SubscriptionRequestCreated } from "../../services/types";
import { navigation } from "../../services/whatsapp";
import { customerProfile, renderWithProviders, signedInAuth } from "../../test/utils";
import { S2BOX } from "../../content/s2box";
import { s2boxApi, type BoxImage } from "../s2box/api";
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
    vi.spyOn(s2boxApi, "images").mockResolvedValue([]);
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
    const images: BoxImage[] = [
      { id: 1, url: "https://x.supabase.co/s2box/a.jpg", alt_text: "Caja abierta", sort_order: 0 },
      { id: 2, url: "https://x.supabase.co/s2box/b.jpg", alt_text: null, sort_order: 1 },
    ];

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

    it("muestra la galería con las imágenes de la API, con alt_text y carga diferida", async () => {
      vi.spyOn(s2boxApi, "images").mockResolvedValue(images);
      renderWithProviders(<S2BoxPage />);

      const photo = await screen.findByRole("img", { name: "Caja abierta" });
      expect(photo).toHaveAttribute("loading", "lazy");
      expect(photo).toHaveAttribute("src", images[0].url);
      expect(screen.getAllByRole("button", { name: /Ampliar imagen/ })).toHaveLength(2);
    });

    it("con la galería vacía muestra el mensaje y ningún error", async () => {
      renderWithProviders(<S2BoxPage />);

      expect(await screen.findByText(S2BOX.galleryEmpty)).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("el modal de la imagen abre al pulsar, atrapa el foco y cierra con Esc", async () => {
      vi.spyOn(s2boxApi, "images").mockResolvedValue(images);
      renderWithProviders(<S2BoxPage />);

      await userEvent.click(await screen.findByRole("button", { name: "Ampliar imagen: Caja abierta" }));

      const dialog = screen.getByRole("dialog", { name: "Caja abierta" });
      expect(dialog).toHaveAttribute("aria-modal", "true");
      const close = screen.getByRole("button", { name: "Cerrar" });
      expect(close).toHaveFocus();
      await userEvent.tab();
      expect(close).toHaveFocus();

      await userEvent.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("el modal también cierra con el botón Cerrar", async () => {
      vi.spyOn(s2boxApi, "images").mockResolvedValue(images);
      renderWithProviders(<S2BoxPage />);

      await userEvent.click(await screen.findByRole("button", { name: "Ampliar imagen: Caja abierta" }));
      await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import { config } from "../../config";
import { ApiError } from "../../services/api";
import { navigation } from "../../services/whatsapp";
import { AuthContext, type AuthContextValue } from "../auth/AuthProvider";
import { fakeAuth, signedInAuth } from "../../test/utils";
import { MysteryBoxesAdmin } from "../admin/MysteryBoxesAdmin";
import {
  s2boxAdminApi,
  s2boxApi,
  type AdminBoxClaim,
  type AdminMysteryBox,
  type BoxClaimCreated,
  type MysteryBoxCover,
} from "./api";
import { MysteryBoxes } from "./MysteryBoxes";
import { S2BoxOpenPage } from "./S2BoxOpenPage";

const COVER = "https://test-project.supabase.co/storage/v1/object/public/product-images/s2box/portada.jpg";

const plusBox: MysteryBoxCover = {
  id: 7, title: "Caja Soul", teaser: "Una sorpresa", cover_url: COVER, cover_alt: "Caja cerrada", content_access: "plus",
};
const freeBox: MysteryBoxCover = { ...plusBox, id: 8, title: "Caja Libre", content_access: "free" };

function Where() {
  const location = useLocation();
  return (
    <>
      <p data-testid="where">{location.pathname + location.search}</p>
      <p data-testid="state">{JSON.stringify(location.state)}</p>
    </>
  );
}

function renderApp(ui: ReactElement, { auth = fakeAuth(), route = "/s2-box", path = "*" }: { auth?: AuthContextValue; route?: string; path?: string } = {}) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={path} element={ui} />
          <Route path="*" element={<Where />} />
        </Routes>
        <Where />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("MysteryBoxes (portadas en /s2-box)", () => {
  beforeEach(() => {
    vi.spyOn(s2boxApi, "boxes").mockResolvedValue([plusBox, freeBox]);
  });

  it("muestra la portada de cada caja con su insignia", async () => {
    renderApp(<MysteryBoxes membership={{ loading: false, active: false }} onNeedMembership={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "Caja Soul" })).toBeInTheDocument();
    expect(screen.getByText("Exclusivo membresía")).toBeInTheDocument();
    expect(screen.getByText("Para todos")).toBeInTheDocument();
    for (const img of screen.getAllByAltText("Caja cerrada")) expect(img.parentElement).toHaveClass("aspect-[4/5]");
  });

  it("sin sesión lleva a ingresar y vuelve a /s2-box", async () => {
    renderApp(<MysteryBoxes membership={{ loading: false, active: false }} onNeedMembership={vi.fn()} />);

    await userEvent.click(await screen.findByRole("button", { name: "Abrir S2 Box: Caja Soul" }));

    expect(screen.getAllByTestId("where")[0]).toHaveTextContent("/ingresar?next=%2Fs2-box");
  });

  it("con sesión pero sin membresía avisa y no abre la caja", async () => {
    const onNeedMembership = vi.fn();
    renderApp(<MysteryBoxes membership={{ loading: false, active: false }} onNeedMembership={onNeedMembership} />, { auth: signedInAuth() });

    await userEvent.click(await screen.findByRole("button", { name: "Abrir S2 Box: Caja Soul" }));

    expect(onNeedMembership).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId("where")[0]).toHaveTextContent("/s2-box");
    expect(screen.getAllByTestId("where")[0]).not.toHaveTextContent("caja");
  });

  it("con membresía activa abre /s2-box/caja/:id", async () => {
    renderApp(<MysteryBoxes membership={{ loading: false, active: true }} onNeedMembership={vi.fn()} />, { auth: signedInAuth() });

    await userEvent.click(await screen.findByRole("button", { name: "Abrir S2 Box: Caja Soul" }));

    expect(screen.getAllByTestId("where")[0]).toHaveTextContent("/s2-box/caja/7");
  });

  it("una caja «Para todos» se abre incluso sin sesión", async () => {
    renderApp(<MysteryBoxes membership={{ loading: false, active: false }} onNeedMembership={vi.fn()} />);

    await userEvent.click(await screen.findByRole("button", { name: "Abrir S2 Box: Caja Libre" }));

    expect(screen.getAllByTestId("where")[0]).toHaveTextContent("/s2-box/caja/8");
  });

  it("sin cajas no muestra la sección", async () => {
    vi.spyOn(s2boxApi, "boxes").mockResolvedValue([]);
    const { container } = renderApp(<MysteryBoxes membership={{ loading: false, active: false }} onNeedMembership={vi.fn()} />);

    await waitFor(() => expect(s2boxApi.boxes).toHaveBeenCalled());

    expect(container.querySelector("section")).toBeNull();
  });

  const adminAuth = () => signedInAuth({ ...signedInAuth().profile!, role: "admin" });

  it("administrador sin cajas activas ve el aviso con el enlace a Cajas S2 Box", async () => {
    vi.spyOn(s2boxApi, "boxes").mockResolvedValue([]);
    renderApp(<MysteryBoxes membership={{ loading: false, active: false }} onNeedMembership={vi.fn()} />, { auth: adminAuth() });

    expect(await screen.findByText(/Aún no hay cajas activas/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Admin → Cajas S2 Box" })).toHaveAttribute("href", "/admin?tab=cajas");
  });

  it("administrador con la API caída ve el mensaje del error; la clienta no ve nada", async () => {
    vi.spyOn(s2boxApi, "boxes").mockRejectedValue(new ApiError(500, "internal_error", "Falló la carga de cajas"));
    const admin = renderApp(<MysteryBoxes membership={{ loading: false, active: false }} onNeedMembership={vi.fn()} />, { auth: adminAuth() });

    expect(await screen.findByRole("alert")).toHaveTextContent("Falló la carga de cajas");
    admin.unmount();

    const customer = renderApp(<MysteryBoxes membership={{ loading: false, active: false }} onNeedMembership={vi.fn()} />, { auth: signedInAuth() });
    await waitFor(() => expect(s2boxApi.boxes).toHaveBeenCalledTimes(2));
    expect(customer.container.querySelector("section")).toBeNull();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("S2BoxOpenPage", () => {
  const content = {
    id: 7, title: "Caja Soul", content_media_url: "https://www.youtube.com/watch?v=abc12345",
    content_description: "Tu rutina secreta", content_access: "plus" as const,
  };
  const created: BoxClaimCreated = {
    id: "c1", reference: "S2-BOX-ABCD2345", status: "pending", box_id: 7, box_title: "Caja Soul", customer_note: null,
    admin_notes: null, decided_at: null, created_at: "2026-03-02T15:00:00Z", already_existed: false,
    whatsapp_message: "Soy Laura Gómez quiero reclamar mi S2 Box con referencia S2-BOX-ABCD2345",
  };
  const open = (auth = signedInAuth()) => renderApp(<S2BoxOpenPage />, { auth, route: "/s2-box/caja/7", path: "/s2-box/caja/:id" });

  beforeEach(() => {
    config.whatsappNumber = "573001234567";
  });

  it("muestra el video incrustado y la descripción", async () => {
    vi.spyOn(s2boxApi, "boxContent").mockResolvedValue(content);
    open();

    expect(await screen.findByText("Tu rutina secreta")).toBeInTheDocument();
    expect(screen.getByTitle("Caja Soul")).toHaveAttribute("src", expect.stringContaining("youtube-nocookie.com/embed/abc12345"));
    expect(s2boxApi.boxContent).toHaveBeenCalledWith(7);
  });

  it("muestra una imagen subida", async () => {
    vi.spyOn(s2boxApi, "boxContent").mockResolvedValue({ ...content, content_media_url: "https://x.supabase.co/a/foto.jpg" });
    open();

    expect(await screen.findByAltText("Caja Soul")).toHaveAttribute("src", "https://x.supabase.co/a/foto.jpg");
  });

  it("«WhatsApp para el envío» registra el reclamo ANTES de abrir WhatsApp", async () => {
    vi.spyOn(s2boxApi, "boxContent").mockResolvedValue(content);
    const order: string[] = [];
    vi.spyOn(s2boxApi, "claim").mockImplementation(async () => {
      order.push("claim");
      return created;
    });
    const redirect = vi.spyOn(navigation, "redirect").mockImplementation(() => void order.push("redirect"));
    open();

    await userEvent.click(await screen.findByRole("button", { name: "WhatsApp para el envío" }));

    await waitFor(() => expect(redirect).toHaveBeenCalledTimes(1));
    expect(s2boxApi.claim).toHaveBeenCalledWith(7);
    expect(order).toEqual(["claim", "redirect"]);
    expect(redirect).toHaveBeenCalledWith(expect.stringContaining("S2-BOX-ABCD2345"));
    expect(await screen.findByText("S2-BOX-ABCD2345")).toBeInTheDocument();
  });

  it("un reclamo repetido avisa que ya estaba pendiente", async () => {
    vi.spyOn(s2boxApi, "boxContent").mockResolvedValue(content);
    vi.spyOn(s2boxApi, "claim").mockResolvedValue({ ...created, already_existed: true });
    vi.spyOn(navigation, "redirect").mockImplementation(() => {});
    open();

    await userEvent.click(await screen.findByRole("button", { name: "WhatsApp para el envío" }));

    expect(await screen.findByText("Ya tenías un reclamo pendiente")).toBeInTheDocument();
  });

  it("si el reclamo falla no abre WhatsApp y muestra el error", async () => {
    vi.spyOn(s2boxApi, "boxContent").mockResolvedValue(content);
    vi.spyOn(s2boxApi, "claim").mockRejectedValue(new ApiError(409, "box_already_claimed", "Ya reclamaste esta caja (S2-BOX-OLD)."));
    const redirect = vi.spyOn(navigation, "redirect").mockImplementation(() => {});
    open();

    await userEvent.click(await screen.findByRole("button", { name: "WhatsApp para el envío" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ya reclamaste esta caja");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("403 membership_required vuelve a /s2-box para ver los planes", async () => {
    vi.spyOn(s2boxApi, "boxContent").mockRejectedValue(new ApiError(403, "membership_required", "Necesitas la membresía", { login_required: false }));
    open();

    await waitFor(() => expect(screen.getAllByTestId("where")[0].textContent).toBe("/s2-box"));
    expect(screen.getAllByTestId("state")[0]).toHaveTextContent('"needMembership":true');
  });

  it("403 con login_required lleva a ingresar", async () => {
    vi.spyOn(s2boxApi, "boxContent").mockRejectedValue(new ApiError(403, "membership_required", "Inicia sesión", { login_required: true }));
    open(fakeAuth());

    await waitFor(() => expect(screen.getAllByTestId("where")[0]).toHaveTextContent("/ingresar?next=%2Fs2-box%2Fcaja%2F7"));
  });
});

describe("MysteryBoxesAdmin", () => {
  const box: AdminMysteryBox = {
    id: 1, title: "Caja Soul", teaser: "Una sorpresa", cover_url: COVER, cover_alt: "Caja cerrada", content_media_url: null,
    content_description: "Contenido", content_access: "plus", is_active: true, sort_order: 0,
    created_at: "2026-03-02T15:00:00Z", updated_at: "2026-03-02T15:00:00Z",
  };
  const claim: AdminBoxClaim = {
    id: "c1", reference: "S2-BOX-ABCD2345", status: "pending", box_id: 1, box_title: "Caja Soul", customer_note: null,
    admin_notes: null, decided_at: null, created_at: "2026-03-02T15:00:00Z", user_id: "u1",
    customer_email: "laura@example.com", customer_name: "Laura Gómez", customer_phone: "3001234567",
  };

  beforeEach(() => {
    vi.spyOn(s2boxAdminApi, "boxes").mockResolvedValue([box]);
    vi.spyOn(s2boxAdminApi, "claims").mockResolvedValue([claim]);
  });

  const render_ = () => renderApp(<MysteryBoxesAdmin />, { auth: signedInAuth({ ...signedInAuth().profile!, role: "admin" }) });

  it("el formulario tiene las dos secciones y el selector de acceso con dos opciones", async () => {
    render_();

    await userEvent.click(await screen.findByRole("button", { name: "Nueva caja" }));

    expect(screen.getByText("Portada (visible para todos)")).toBeInTheDocument();
    expect(screen.getByText("Contenido S2 Box")).toBeInTheDocument();
    const options = Array.from(screen.getByLabelText("Acceso").querySelectorAll("option")).map((o) => [o.value, o.textContent]);
    expect(options).toEqual([["plus", "Solo membresía S2 Box"], ["free", "Para todos"]]);
    expect(screen.getByText(/foto vertical 4:5 \(1080 × 1350 px\)/)).toBeInTheDocument();
  });

  it("crear envía el acceso elegido y la portada subida", async () => {
    vi.spyOn(s2boxAdminApi, "upload").mockResolvedValue({ url: COVER });
    const create = vi.spyOn(s2boxAdminApi, "createBox").mockResolvedValue({ ...box, id: 2 });
    render_();
    await userEvent.click(await screen.findByRole("button", { name: "Nueva caja" }));

    await userEvent.type(screen.getByLabelText("Título"), "Caja Aurora");
    await userEvent.type(screen.getByLabelText("Descripción"), "Rutina secreta");
    await userEvent.selectOptions(screen.getByLabelText("Acceso"), "free");
    await userEvent.upload(screen.getByLabelText(/Subir portada/), new File(["x"], "portada.jpg", { type: "image/jpeg" }));
    await waitFor(() => expect(s2boxAdminApi.upload).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("button", { name: "Crear caja" }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      title: "Caja Aurora", content_access: "free", cover_url: COVER, content_description: "Rutina secreta", is_active: true,
    }));
  });

  it("no deja crear una caja sin portada", async () => {
    const create = vi.spyOn(s2boxAdminApi, "createBox");
    render_();
    await userEvent.click(await screen.findByRole("button", { name: "Nueva caja" }));
    await userEvent.type(screen.getByLabelText("Título"), "Caja Aurora");
    await userEvent.type(screen.getByLabelText("Descripción"), "Rutina secreta");

    await userEvent.click(screen.getByRole("button", { name: "Crear caja" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Sube la imagen de portada");
    expect(create).not.toHaveBeenCalled();
  });

  it("editar carga los datos y guarda los cambios", async () => {
    const update = vi.spyOn(s2boxAdminApi, "updateBox").mockResolvedValue(box);
    render_();

    await userEvent.click(await screen.findByRole("button", { name: "Editar Caja Soul" }));
    const title = screen.getByLabelText("Título");
    expect(title).toHaveValue("Caja Soul");
    await userEvent.clear(title);
    await userEvent.type(title, "Caja Soul 2");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(update).toHaveBeenCalledWith(1, expect.objectContaining({ title: "Caja Soul 2", content_access: "plus" })));
  });

  it("eliminar pide confirmación y llama a la API", async () => {
    const remove = vi.spyOn(s2boxAdminApi, "removeBox").mockResolvedValue(undefined);
    render_();

    await userEvent.click(await screen.findByRole("button", { name: "Eliminar Caja Soul" }));
    expect(remove).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));

    await waitFor(() => expect(remove).toHaveBeenCalledWith(1));
  });

  it("lista los reclamos pendientes con el teléfono formateado", async () => {
    render_();

    expect(await screen.findByText("S2-BOX-ABCD2345")).toBeInTheDocument();
    expect(screen.getByText("300 123 4567")).toBeInTheDocument();
    expect(screen.getByText("Laura Gómez")).toBeInTheDocument();
    expect(s2boxAdminApi.claims).toHaveBeenCalledWith("pending");
  });

  it("el filtro cambia la consulta", async () => {
    render_();
    await screen.findByText("S2-BOX-ABCD2345");

    await userEvent.selectOptions(screen.getByLabelText("Mostrar"), "all");

    await waitFor(() => expect(s2boxAdminApi.claims).toHaveBeenLastCalledWith(undefined));
  });

  it("Aceptar y Rechazar llaman a la API con la nota", async () => {
    const accept = vi.spyOn(s2boxAdminApi, "acceptClaim").mockResolvedValue({ ...claim, status: "accepted" });
    const reject = vi.spyOn(s2boxAdminApi, "rejectClaim").mockResolvedValue({ ...claim, status: "rejected" });
    render_();

    await userEvent.type(await screen.findByLabelText("Nota (opcional)"), "Enviar el lunes");
    await userEvent.click(screen.getByRole("button", { name: "Aceptar S2-BOX-ABCD2345" }));
    await waitFor(() => expect(accept).toHaveBeenCalledWith("c1", "Enviar el lunes"));
    await userEvent.click(await screen.findByRole("button", { name: "Rechazar S2-BOX-ABCD2345" }));

    await waitFor(() => expect(reject).toHaveBeenCalledWith("c1", ""));
  });
});

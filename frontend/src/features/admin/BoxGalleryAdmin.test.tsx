import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "../../test/utils";
import { s2boxAdminApi, type AdminBoxImage } from "../s2box/api";
import { BoxGalleryAdmin } from "./BoxGalleryAdmin";

const image = (id: number, order: number, extra: Partial<AdminBoxImage> = {}): AdminBoxImage => ({
  id, url: `https://x.supabase.co/s2box/${id}.jpg`, alt_text: `Caja ${id}`, sort_order: order, is_active: true,
  created_at: "2026-03-02T15:00:00Z", updated_at: "2026-03-02T15:00:00Z", ...extra,
});

describe("BoxGalleryAdmin", () => {
  beforeEach(() => {
    vi.spyOn(s2boxAdminApi, "list").mockResolvedValue([image(1, 0), image(2, 1, { is_active: false })]);
  });
  afterEach(() => vi.restoreAllMocks());

  it("lista las imágenes con miniatura, texto alternativo, orden y estado", async () => {
    renderWithProviders(<BoxGalleryAdmin />);

    expect(await screen.findByRole("img", { name: "Caja 1" })).toHaveAttribute("src", expect.stringContaining("/1.jpg"));
    expect(screen.getByText("Activa")).toBeInTheDocument();
    expect(screen.getByText("Oculta")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Texto alternativo")).toHaveLength(2);
  });

  it("sube una imagen y la registra al final de la galería", async () => {
    const upload = vi.spyOn(s2boxAdminApi, "upload").mockResolvedValue({ url: "https://x.supabase.co/s2box/nueva.jpg" });
    const create = vi.spyOn(s2boxAdminApi, "create").mockResolvedValue(image(3, 2));
    renderWithProviders(<BoxGalleryAdmin />);
    await screen.findByRole("img", { name: "Caja 1" });

    await userEvent.upload(screen.getByLabelText("Subir imagen"), new File(["x"], "caja.png", { type: "image/png" }));

    await waitFor(() => expect(create).toHaveBeenCalledWith({ url: "https://x.supabase.co/s2box/nueva.jpg", sort_order: 2 }));
    expect(upload).toHaveBeenCalled();
  });

  it("edita el texto alternativo y activa o desactiva", async () => {
    const update = vi.spyOn(s2boxAdminApi, "update").mockResolvedValue(image(1, 0));
    renderWithProviders(<BoxGalleryAdmin />);
    const [firstAlt] = await screen.findAllByLabelText("Texto alternativo");

    await userEvent.clear(firstAlt);
    await userEvent.type(firstAlt, "Caja de marzo");
    await userEvent.click(screen.getAllByRole("button", { name: "Guardar texto" })[0]);
    await waitFor(() => expect(update).toHaveBeenCalledWith(1, { alt_text: "Caja de marzo" }));

    await userEvent.click(screen.getByRole("button", { name: "Desactivar" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(1, { is_active: false }));
    await userEvent.click(screen.getByRole("button", { name: "Activar" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(2, { is_active: true }));
  });

  it("baja una imagen intercambiando el orden con la vecina", async () => {
    const update = vi.spyOn(s2boxAdminApi, "update").mockResolvedValue(image(1, 0));
    renderWithProviders(<BoxGalleryAdmin />);

    await userEvent.click(await screen.findByRole("button", { name: "Bajar Caja 1" }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update).toHaveBeenCalledWith(2, { sort_order: 0 });
    expect(update).toHaveBeenCalledWith(1, { sort_order: 1 });
    expect(screen.getByRole("button", { name: "Subir Caja 1" })).toBeDisabled();
  });

  it("pide confirmación antes de eliminar", async () => {
    const remove = vi.spyOn(s2boxAdminApi, "remove").mockResolvedValue(undefined);
    renderWithProviders(<BoxGalleryAdmin />);

    await userEvent.click((await screen.findAllByRole("button", { name: "Eliminar" }))[0]);
    expect(remove).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));

    await waitFor(() => expect(remove).toHaveBeenCalledWith(1));
  });
});

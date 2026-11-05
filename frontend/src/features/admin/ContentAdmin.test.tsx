import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ApiError } from "../../services/api";
import { renderWithProviders } from "../../test/utils";
import { adminApi, type AdminChallenge, type AdminContent } from "./api";
import { ContentAdmin } from "./ContentAdmin";

const content = (id: number, title: string, extra: Partial<AdminContent> = {}): AdminContent => ({
  id, kind: "routine", title, summary: null, body: "Paso a paso", media_url: null, cover_url: null, meta: "Video · 20 min",
  meal_slot: null, is_published: true, is_demo: false, sort_order: 0, ...extra,
});

const challenge = (id: number, title: string, extra: Partial<AdminChallenge> = {}): AdminChallenge => ({
  id, title, description: "Toma agua", target_count: 30, is_active: true, is_demo: false, sort_order: 0, ...extra,
});

describe("ContentAdmin · editar, archivar y eliminar", () => {
  beforeEach(() => {
    vi.spyOn(adminApi, "content").mockResolvedValue([content(1, "Full body")]);
    vi.spyOn(adminApi, "challenges").mockResolvedValue([challenge(1, "30 días de agua")]);
    vi.spyOn(adminApi, "rewards").mockResolvedValue([]);
    vi.spyOn(adminApi, "redemptions").mockResolvedValue([]);
  });
  afterEach(() => vi.restoreAllMocks());

  it("editar un contenido lo precarga y el PATCH solo lleva lo cambiado", async () => {
    const update = vi.spyOn(adminApi, "updateContent").mockResolvedValue(content(1, "Full body en casa"));
    renderWithProviders(<ContentAdmin />);

    await userEvent.click(await screen.findByRole("button", { name: "Editar Full body" }));
    const title = screen.getByLabelText("Título", { selector: "#c1-title" });
    expect(title).toHaveValue("Full body");
    expect(screen.getByLabelText("Contenido", { selector: "#c1-body" })).toHaveValue("Paso a paso");
    await userEvent.clear(title);
    await userEvent.type(title, "Full body en casa");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(update).toHaveBeenCalledWith(1, { title: "Full body en casa" }));
    expect(await screen.findByText("Contenido actualizado.")).toBeInTheDocument();
  });

  it("eliminar un contenido pide confirmación, llama a DELETE y la fila desaparece", async () => {
    vi.spyOn(adminApi, "content").mockResolvedValueOnce([content(1, "Full body"), content(2, "Receta fit")]).mockResolvedValue([content(2, "Receta fit")]);
    const remove = vi.spyOn(adminApi, "deleteContent").mockResolvedValue(undefined);
    renderWithProviders(<ContentAdmin />);

    await userEvent.click(await screen.findByRole("button", { name: "Eliminar Full body" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(remove).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.queryByText("Full body")).not.toBeInTheDocument());
    expect(screen.getByText("Receta fit")).toBeInTheDocument();
  });

  it("un reto con participantes responde 409: muestra el mensaje y archiva en su lugar", async () => {
    const message = "Este reto tiene 4 participantes con su progreso. Puedes archivarlo para que deje de ofrecerse.";
    vi.spyOn(adminApi, "deleteChallenge").mockRejectedValue(new ApiError(409, "RESOURCE_IN_USE", message, { participants: 4 }));
    const archive = vi.spyOn(adminApi, "archiveChallenge").mockResolvedValue(challenge(1, "30 días de agua", { is_active: false }));
    renderWithProviders(<ContentAdmin />);

    await userEvent.click(await screen.findByRole("button", { name: "Eliminar 30 días de agua" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Eliminar" }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Archivar en su lugar" }));

    await waitFor(() => expect(archive).toHaveBeenCalledWith(1));
  });

  it("«Mostrar archivados» muestra y oculta los elementos archivados", async () => {
    vi.spyOn(adminApi, "challenges").mockImplementation(async (includeArchived) =>
      includeArchived ? [challenge(1, "30 días de agua"), challenge(2, "Reto viejo", { is_active: false })] : [challenge(1, "30 días de agua")]);
    renderWithProviders(<ContentAdmin />);
    await screen.findByText("30 días de agua");
    expect(screen.queryByText("Reto viejo")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("switch", { name: "Mostrar archivados" }));
    expect(await screen.findByText("Reto viejo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restaurar Reto viejo" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("switch", { name: "Mostrar archivados" }));
    await waitFor(() => expect(screen.queryByText("Reto viejo")).not.toBeInTheDocument());
  });

  it("editar un reto envía solo el campo cambiado", async () => {
    const update = vi.spyOn(adminApi, "updateChallenge").mockResolvedValue(challenge(1, "30 días de agua", { target_count: 21 }));
    renderWithProviders(<ContentAdmin />);

    await userEvent.click(await screen.findByRole("button", { name: "Editar 30 días de agua" }));
    const days = screen.getByLabelText("Días del reto");
    expect(days).toHaveValue(30);
    await userEvent.clear(days);
    await userEvent.type(days, "21");
    await userEvent.click(screen.getByRole("button", { name: "Guardar reto" }));

    await waitFor(() => expect(update).toHaveBeenCalledWith(1, { target_count: 21 }));
  });
});

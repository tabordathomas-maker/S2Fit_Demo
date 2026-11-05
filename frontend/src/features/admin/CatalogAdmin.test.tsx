import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ApiError } from "../../services/api";
import type { Category } from "../../services/types";
import { renderWithProviders } from "../../test/utils";
import { adminApi, type AdminProduct } from "./api";
import { CatalogAdmin } from "./CatalogAdmin";

const category: Category = { id: 1, name: "Conjuntos", slug: "conjuntos", description: null, sort_order: 0, is_active: true };

const product = (id: number, name: string, extra: Partial<AdminProduct> = {}): AdminProduct => ({
  id, category_id: 1, name, slug: name.toLowerCase().replace(/ /g, "-"), description: "Tela suave", base_price: 100000,
  image_url: null, is_active: true, is_demo: false,
  variants: [{ id: id * 10, sku: `SKU-${id}`, size: "M", color: "Lila", unit_price: 100000, available: 3, is_active: true, price_override: null, stock_on_hand: 4, stock_reserved: 1 }],
  ...extra,
});

describe("CatalogAdmin · editar, archivar y eliminar", () => {
  beforeEach(() => {
    vi.spyOn(adminApi, "categories").mockResolvedValue([category]);
  });
  afterEach(() => vi.restoreAllMocks());

  it("editar precarga el producto y el PATCH solo lleva lo cambiado", async () => {
    vi.spyOn(adminApi, "products").mockResolvedValue([product(1, "Set lila")]);
    const update = vi.spyOn(adminApi, "updateProduct").mockResolvedValue(product(1, "Set lila"));
    renderWithProviders(<CatalogAdmin />);

    await userEvent.click(await screen.findByRole("button", { name: "Editar Set lila" }));
    expect(screen.getByLabelText("Nombre", { selector: "#n-1" })).toHaveValue("Set lila");
    const price = screen.getByLabelText("Precio base (COP)", { selector: "#p-1" });
    expect(price).toHaveValue(100000);
    await userEvent.clear(price);
    await userEvent.type(price, "120000");
    await userEvent.click(screen.getByRole("button", { name: "Guardar producto" }));

    await waitFor(() => expect(update).toHaveBeenCalledWith(1, { base_price: 120000 }));
  });

  it("eliminar → confirmación → DELETE → la fila desaparece", async () => {
    vi.spyOn(adminApi, "products").mockResolvedValueOnce([product(1, "Set lila"), product(2, "Mono negro")]).mockResolvedValue([product(2, "Mono negro")]);
    const remove = vi.spyOn(adminApi, "deleteProduct").mockResolvedValue(undefined);
    renderWithProviders(<CatalogAdmin />);

    await userEvent.click(await screen.findByRole("button", { name: "Eliminar Set lila" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(remove).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.queryByText("Set lila")).not.toBeInTheDocument());
    expect(screen.getByText("Mono negro")).toBeInTheDocument();
  });

  it("409 RESOURCE_IN_USE muestra el mensaje y «Archivar en su lugar» archiva el producto", async () => {
    const message = "Este producto aparece en 3 pedidos. Puedes archivarlo para ocultarlo de la tienda.";
    vi.spyOn(adminApi, "products").mockResolvedValue([product(1, "Set lila")]);
    vi.spyOn(adminApi, "deleteProduct").mockRejectedValue(new ApiError(409, "RESOURCE_IN_USE", message, { orders: 3 }));
    const archive = vi.spyOn(adminApi, "archiveProduct").mockResolvedValue(product(1, "Set lila", { is_active: false }));
    renderWithProviders(<CatalogAdmin />);

    await userEvent.click(await screen.findByRole("button", { name: "Eliminar Set lila" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Eliminar" }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Archivar en su lugar" }));

    await waitFor(() => expect(archive).toHaveBeenCalledWith(1));
    expect(await screen.findByText("«Set lila» archivado.")).toBeInTheDocument();
  });

  it("«Mostrar archivados» pide también lo archivado y permite restaurarlo", async () => {
    const list = vi.spyOn(adminApi, "products").mockImplementation(async (includeArchived) =>
      includeArchived ? [product(1, "Set lila"), product(2, "Gorra vieja", { is_active: false })] : [product(1, "Set lila")]);
    const restore = vi.spyOn(adminApi, "restoreProduct").mockResolvedValue(product(2, "Gorra vieja"));
    renderWithProviders(<CatalogAdmin />);
    await screen.findByText("Set lila");
    expect(screen.queryByText("Gorra vieja")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("switch", { name: "Mostrar archivados" }));
    expect(await screen.findByText("Gorra vieja")).toBeInTheDocument();
    expect(screen.getByText("Archivado")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Restaurar Gorra vieja" }));
    await waitFor(() => expect(restore).toHaveBeenCalledWith(2));

    await userEvent.click(screen.getByRole("switch", { name: "Mostrar archivados" }));
    await waitFor(() => expect(screen.queryByText("Gorra vieja")).not.toBeInTheDocument());
    expect(list).toHaveBeenCalledWith(true);
  });

  it("edita una categoría enviando solo el campo cambiado", async () => {
    vi.spyOn(adminApi, "products").mockResolvedValue([]);
    const update = vi.spyOn(adminApi, "updateCategory").mockResolvedValue(category);
    renderWithProviders(<CatalogAdmin />);

    await userEvent.click(await screen.findByRole("button", { name: "Editar Conjuntos" }));
    const name = screen.getByLabelText("Nombre de la categoría");
    expect(name).toHaveValue("Conjuntos");
    await userEvent.clear(name);
    await userEvent.type(name, "Sets deportivos");
    await userEvent.click(screen.getByRole("button", { name: "Guardar categoría" }));

    await waitFor(() => expect(update).toHaveBeenCalledWith(1, { name: "Sets deportivos" }));
  });
});

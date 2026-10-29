import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ProductDetail } from "../../services/types";
import { renderWithProviders } from "../../test/utils";
import { catalogApi } from "./api";
import { ProductPage } from "./ProductPage";
import { ShopPage } from "./ShopPage";

const category = { id: 1, name: "Conjuntos", slug: "conjuntos", description: null, sort_order: 0, is_active: true };
const product: ProductDetail = {
  id: 1, name: "Set lila", slug: "set-lila", description: "Top cruzado + short", base_price: 145000,
  image_url: null, is_demo: true, category, sizes: ["S", "M"], colors: ["Lila"], in_stock: true,
  variants: [
    { id: 10, sku: "LILA-S", size: "S", color: "Lila", unit_price: 145000, available: 0, is_active: true },
    { id: 11, sku: "LILA-M", size: "M", color: "Lila", unit_price: 145000, available: 2, is_active: true },
  ],
};

describe("Tienda", () => {
  afterEach(() => vi.restoreAllMocks());

  it("lista los productos que entrega la API con su precio en COP", async () => {
    vi.spyOn(catalogApi, "categories").mockResolvedValue([category]);
    vi.spyOn(catalogApi, "products").mockResolvedValue([product]);
    renderWithProviders(<ShopPage />);

    expect(await screen.findByRole("heading", { name: "Set lila" })).toBeInTheDocument();
    expect(screen.getByText("$145.000 COP")).toBeInTheDocument();
    expect(screen.getByText("Precio de ejemplo")).toBeInTheDocument();
  });

  it("envía los filtros de búsqueda a la API", async () => {
    vi.spyOn(catalogApi, "categories").mockResolvedValue([category]);
    const products = vi.spyOn(catalogApi, "products").mockResolvedValue([]);
    renderWithProviders(<ShopPage />);

    await userEvent.type(screen.getByLabelText("Buscar"), "mono");
    await userEvent.click(screen.getByRole("button", { name: "Buscar" }));

    expect(products).toHaveBeenLastCalledWith(expect.objectContaining({ q: "mono" }));
    expect(await screen.findByText("No encontramos prendas con esos filtros.")).toBeInTheDocument();
  });
});

describe("Detalle de producto", () => {
  afterEach(() => vi.restoreAllMocks());

  it("exige talla disponible antes de agregar a la bolsa", async () => {
    vi.spyOn(catalogApi, "product").mockResolvedValue(product);
    renderWithProviders(<ProductPage />, { route: "/tienda/set-lila", path: "/tienda/:slug" });

    const addButton = await screen.findByRole("button", { name: "Agregar a la bolsa" });
    expect(addButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "S (agotada)" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "M" }));
    await userEvent.click(addButton);

    expect(screen.getByText(/Agregado a tu bolsa/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("s2fit:cart")!)[0]).toMatchObject({ variantId: 11, quantity: 1 });
  });
});

import { fireEvent, render, screen } from "@testing-library/react";

import { catalogApi } from "./api";
import { ProductImage } from "./ProductImage";
import { ShopPage } from "./ShopPage";
import { renderWithProviders } from "../../test/utils";

const URL_FOTO = "https://example.com/set-soul.jpg";

describe("ProductImage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("por defecto usa object-contain, nunca object-cover, y el contenedor es 4:5", () => {
    render(<ProductImage src={URL_FOTO} alt="Set Soul" />);

    const img = screen.getByAltText("Set Soul");
    expect(img).toHaveClass("object-contain", "object-center");
    expect(img).not.toHaveClass("object-cover");
    expect(img).toHaveAttribute("decoding", "async");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img.parentElement).toHaveClass("aspect-[4/5]", "overflow-hidden", "relative");
  });

  it("fit=cover llena la caja con object-cover", () => {
    render(<ProductImage src={URL_FOTO} alt="Set Soul" fit="cover" />);

    expect(screen.getByAltText("Set Soul")).toHaveClass("object-cover");
  });

  it("fit=blur pinta una copia decorativa detrás de la foto completa", () => {
    const { container } = render(<ProductImage src={URL_FOTO} alt="Set Soul" fit="blur" />);

    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute("aria-hidden", "true");
    expect(images[0]).toHaveAttribute("alt", "");
    expect(images[1]).toHaveClass("object-contain");
  });

  it("acepta otra proporción", () => {
    render(<ProductImage src={URL_FOTO} alt="Set Soul" ratio="aspect-square" />);

    expect(screen.getByAltText("Set Soul").parentElement).toHaveClass("aspect-square");
  });

  it("si la imagen falla muestra el respaldo S2 con la misma proporción", () => {
    render(<ProductImage src={URL_FOTO} alt="Set Soul" />);

    fireEvent.error(screen.getByAltText("Set Soul"));

    const fallback = screen.getByRole("img", { name: "Set Soul" });
    expect(fallback).toHaveTextContent("S2");
    expect(fallback).toHaveClass("aspect-[4/5]");
  });

  it("sin imagen muestra el respaldo S2", () => {
    render(<ProductImage src={null} alt="Sin foto" />);

    expect(screen.getByRole("img", { name: "Sin foto" })).toHaveTextContent("S2");
  });

  it("la tarjeta de la tienda ya no fija una altura de 340 px", async () => {
    const category = { id: 1, name: "Conjuntos", slug: "conjuntos", description: null, sort_order: 0, is_active: true };
    vi.spyOn(catalogApi, "categories").mockResolvedValue([category]);
    vi.spyOn(catalogApi, "products").mockResolvedValue([{
      id: 1, name: "Set Soul", slug: "set-soul", description: null, base_price: 145000, image_url: URL_FOTO,
      is_demo: false, category, sizes: ["S"], colors: ["Lila"], in_stock: true,
    }]);
    renderWithProviders(<ShopPage />);

    const img = await screen.findByAltText("Set Soul");

    expect(img.parentElement).not.toHaveClass("h-[340px]");
    expect(img.parentElement).toHaveClass("aspect-[4/5]", "w-full");
  });
});

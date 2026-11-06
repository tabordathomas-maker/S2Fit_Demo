import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { HomePage } from "../pages/HomePage";
import { config } from "../config";
import type { OrderWithMessage, Plan, ProductDetail, ProductSummary } from "../services/types";
import { formatSize, sizeOptions } from "../services/sizes";
import { navigation } from "../services/whatsapp";
import { fakeAuth, renderWithProviders, signedInAuth } from "../test/utils";
import { AuthContext } from "./auth/AuthProvider";
import { LoginPage, RegisterPage } from "./auth/AuthPages";
import { CartPage } from "./cart/CartPage";
import { catalogApi } from "./catalog/api";
import { ProductPage } from "./catalog/ProductPage";
import { ShopPage } from "./catalog/ShopPage";
import { ordersApi } from "./orders/api";
import { s2boxApi } from "./s2box/api";
import { subscriptionsApi } from "./subscriptions/api";
import { S2BoxPage } from "./subscriptions/S2BoxPage";

const category = { id: 1, name: "Sets", slug: "sets", description: null, sort_order: 0, is_active: true };
const summary = (id: number, name: string, extra: Partial<ProductSummary> = {}): ProductSummary => ({
  id, name, slug: name.toLowerCase().replace(/ /g, "-"), description: null, base_price: 100000, image_url: null, is_demo: false,
  category, sizes: ["Unica"], colors: ["Negro"], in_stock: true, ...extra,
});

describe("formatSize y sizeOptions", () => {
  it("unica, Unica, UNICA y única se muestran como «Única»", () => {
    expect(["unica", "Unica", "UNICA", "única"].map(formatSize)).toEqual(["Única", "Única", "Única", "Única"]);
    expect(formatSize("XL")).toBe("XL");
  });

  it("ordena XS, S, M, L, XL, Única y luego el resto, sin duplicar por tilde o mayúsculas", () => {
    const options = sizeOptions(["Unica", "L", "única", "36", "XS", "M"]);

    expect(options.map((o) => o.label)).toEqual(["XS", "M", "L", "Única", "36"]);
    expect(options.find((o) => o.label === "Única")?.value).toBe("Unica");
  });
});

describe("Inicio · Para moverte hoy", () => {
  afterEach(() => vi.restoreAllMocks());

  it("muestra solo productos con existencias cuando los hay", async () => {
    vi.spyOn(catalogApi, "products").mockResolvedValue([
      summary(1, "Set Soul", { in_stock: false }), summary(2, "Set Ross", { in_stock: false }), summary(3, "Mono Negro"), summary(4, "Short Aqua"),
    ]);
    renderWithProviders(<HomePage />);

    expect(await screen.findByText("Mono Negro")).toBeInTheDocument();
    expect(screen.getByText("Short Aqua")).toBeInTheDocument();
    expect(screen.queryByText("Set Soul")).not.toBeInTheDocument();
    expect(screen.queryByText("Agotado")).not.toBeInTheDocument();
  });

  it("con todo agotado muestra los más recientes con la etiqueta «Agotado»", async () => {
    vi.spyOn(catalogApi, "products").mockResolvedValue([
      summary(1, "Set Soul", { in_stock: false }), summary(2, "Set Ross", { in_stock: false }), summary(3, "Set Mila", { in_stock: false }), summary(4, "Set Nora", { in_stock: false }),
    ]);
    renderWithProviders(<HomePage />);

    expect(await screen.findByText("Set Nora")).toBeInTheDocument();
    expect(screen.queryByText("Set Soul")).not.toBeInTheDocument();
    expect(screen.getAllByText("Agotado")).toHaveLength(3);
  });
});

describe("Tienda", () => {
  beforeEach(() => {
    vi.spyOn(catalogApi, "categories").mockResolvedValue([category]);
  });
  afterEach(() => vi.restoreAllMocks());

  it("muestra los disponibles primero y los agotados al final, conservando el orden", async () => {
    vi.spyOn(catalogApi, "products").mockResolvedValue([
      summary(1, "Set Soul", { in_stock: false }), summary(2, "Mono Negro"), summary(3, "Set Ross", { in_stock: false }), summary(4, "Short Aqua"),
    ]);
    renderWithProviders(<ShopPage />);

    await screen.findByRole("heading", { name: "Mono Negro" });
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Mono Negro", "Short Aqua", "Set Soul", "Set Ross"]);
  });

  it("el filtro de talla ofrece las tallas del catálogo y «Única» se envía a la API", async () => {
    const products = vi.spyOn(catalogApi, "products").mockResolvedValue([summary(1, "Set Soul", { sizes: ["Unica"] }), summary(2, "Top", { sizes: ["S", "M"] })]);
    renderWithProviders(<ShopPage />);
    await screen.findByRole("heading", { name: "Set Soul" });

    const select = screen.getByLabelText("Talla");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["Todas", "S", "M", "Única"]);
    await userEvent.selectOptions(select, "Única");

    await waitFor(() => expect(products).toHaveBeenLastCalledWith(expect.objectContaining({ size: "Unica" })));
    expect(screen.getByText("Tallas: Única")).toBeInTheDocument();
  });

  it("un producto sin variantes dice «Consultar disponibilidad» en vez de «Tallas: —»", async () => {
    vi.spyOn(catalogApi, "products").mockResolvedValue([summary(1, "Set Nuevo", { sizes: [], in_stock: false })]);
    renderWithProviders(<ShopPage />);

    expect(await screen.findByText("Consultar disponibilidad")).toBeInTheDocument();
    expect(screen.queryByText(/Tallas: —/)).not.toBeInTheDocument();
  });
});

describe("Ficha de producto", () => {
  afterEach(() => vi.restoreAllMocks());
  const detail = (variants: ProductDetail["variants"]): ProductDetail => ({ ...summary(1, "Set lila", { sizes: variants.map((v) => v.size) }), variants });

  it("incluye el bloque del QR a Mi Ruta con su aria-label y el enlace", async () => {
    vi.spyOn(catalogApi, "product").mockResolvedValue(detail([{ id: 10, sku: "A", size: "Unica", color: "Negro", unit_price: 100000, available: 2, is_active: true }]));
    renderWithProviders(<ProductPage />, { route: "/tienda/set-lila", path: "/tienda/:slug" });

    expect(await screen.findByText("Incluye QR a Mi Ruta")).toBeInTheDocument();
    expect(screen.getByText("Al comprar recibes un código o QR para entrar a Mi Ruta.")).toBeInTheDocument();
    expect(screen.getByLabelText("QR de ejemplo a Mi Ruta")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "¿Tienes un código?" })).toHaveAttribute("href", "/mi-ruta");
    expect(screen.getByRole("button", { name: "Única" })).toBeInTheDocument();
  });

  it("sin variantes no se puede agregar a la bolsa", async () => {
    vi.spyOn(catalogApi, "product").mockResolvedValue(detail([]));
    renderWithProviders(<ProductPage />, { route: "/tienda/set-lila", path: "/tienda/:slug" });

    expect(await screen.findByText("Consultar disponibilidad")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agregar a la bolsa" })).toBeDisabled();
  });
});

describe("Confirmación de pedido", () => {
  afterEach(() => vi.restoreAllMocks());

  it("avisa que Mi Ruta se habilita al confirmar el pago", async () => {
    localStorage.setItem("s2fit:cart", JSON.stringify([{ variantId: 7, productSlug: "x", productName: "Set", variantLabel: "Talla M", imageUrl: null, displayPrice: 1000, quantity: 1, maxQuantity: 3 }]));
    config.whatsappNumber = "573001234567";
    vi.spyOn(ordersApi, "create").mockResolvedValue({ id: "o1", reference: "S2-ORD-ABCD2345", total: 1000, whatsapp_message: "Hola" } as OrderWithMessage);
    vi.spyOn(navigation, "redirect").mockImplementation(() => {});
    renderWithProviders(<CartPage />, { auth: signedInAuth() });

    await userEvent.click(screen.getByRole("button", { name: "Comprar por WhatsApp" }));

    expect(await screen.findByText("Cuando confirmemos tu pago se habilita tu sección Mi Ruta, y tu prenda llegará con un código o QR.")).toBeInTheDocument();
  });
});

describe("S2 Box para la encuesta", () => {
  beforeEach(() => {
    config.whatsappNumber = "573001234567";
    vi.spyOn(subscriptionsApi, "membership").mockResolvedValue({ is_active: false, subscription: null, pending_request: null });
    vi.spyOn(s2boxApi, "boxes").mockResolvedValue([]);
  });
  afterEach(() => vi.restoreAllMocks());

  it("sin planes mantiene la página y ofrece WhatsApp para apartar la primera caja", async () => {
    vi.spyOn(subscriptionsApi, "plans").mockResolvedValue([]);
    renderWithProviders(<S2BoxPage />);

    expect(await screen.findByText("Estamos definiendo los planes. Escríbenos por WhatsApp para apartar tu primera S2 Box.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Escribir por WhatsApp" })).toHaveAttribute("href", expect.stringContaining("wa.me/573001234567"));
  });

  it("un plan con precio oculto muestra «Precio por confirmar»", async () => {
    const plan: Plan = { id: 1, code: "m", name: "S2 Box mensual", description: null, price: null, hide_price: true, duration_days: 30, period_label: "mensual", benefits: [], is_active: true };
    vi.spyOn(subscriptionsApi, "plans").mockResolvedValue([plan]);
    renderWithProviders(<S2BoxPage />);

    expect((await screen.findAllByText("Precio por confirmar")).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Consulta el precio por WhatsApp/)).not.toBeInTheDocument();
  });
});

describe("Registro y login con next", () => {
  const renderAt = (page: "ingresar" | "registro", next: string) =>
    render(
      <AuthContext.Provider value={signedInAuth()}>
        <MemoryRouter initialEntries={[`/${page}?next=${encodeURIComponent(next)}`]}>
          <Routes>
            <Route path="/ingresar" element={<LoginPage />} />
            <Route path="/registro" element={<RegisterPage />} />
            <Route path="/cuenta" element={<p>Pantalla de cuenta</p>} />
            <Route path="/s2-box" element={<p>Pantalla S2 Box</p>} />
            <Route path="*" element={<p>Otra pantalla</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

  it.each(["ingresar", "registro"] as const)("%s: next=/cuenta redirige a /cuenta y una ruta interna se respeta", async (page) => {
    renderAt(page, "/cuenta");
    expect(await screen.findByText("Pantalla de cuenta")).toBeInTheDocument();
  });

  it.each(["ingresar", "registro"] as const)("%s: next=//evil.com y next=https://evil.com redirigen a /cuenta", async (page) => {
    const first = renderAt(page, "//evil.com");
    expect(await screen.findByText("Pantalla de cuenta")).toBeInTheDocument();
    first.unmount();

    renderAt(page, "https://evil.com");
    expect(await screen.findByText("Pantalla de cuenta")).toBeInTheDocument();
  });

  it("tras registrarse sin confirmar correo ofrece explorar la tienda sin cuenta", async () => {
    const signUp = vi.fn().mockResolvedValue({ needsConfirmation: true });
    renderWithProviders(<RegisterPage />, { auth: fakeAuth({ signUp }) });

    await userEvent.type(screen.getByLabelText("Nombre completo"), "Laura Gómez");
    await userEvent.type(screen.getByLabelText("Celular (WhatsApp)"), "3001112233");
    await userEvent.type(screen.getByLabelText("Correo"), "laura@example.com");
    await userEvent.type(screen.getByLabelText("Contraseña"), "contrasena-segura");
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(await screen.findByText("Te enviamos un correo para confirmar tu cuenta. Revisa también spam.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Explorar la tienda sin cuenta" })).toHaveAttribute("href", "/tienda");
  });
});

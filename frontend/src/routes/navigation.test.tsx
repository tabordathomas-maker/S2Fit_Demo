import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { AppRoutes } from "../App";
import { AuthContext, type AuthContextValue } from "../features/auth/AuthProvider";
import { CartProvider } from "../features/cart/CartProvider";
import { catalogApi } from "../features/catalog/api";
import { contentApi } from "../features/content/api";
import { customerProfile, fakeAuth, signedInAuth } from "../test/utils";

function renderApp(route: string, auth: AuthContextValue = fakeAuth()) {
  return render(
    <AuthContext.Provider value={auth}>
      <CartProvider>
        <MemoryRouter initialEntries={[route]}>
          <AppRoutes />
        </MemoryRouter>
      </CartProvider>
    </AuthContext.Provider>,
  );
}

describe("Navegación", () => {
  beforeEach(() => {
    vi.spyOn(catalogApi, "products").mockResolvedValue([]);
    vi.spyOn(catalogApi, "categories").mockResolvedValue([]);
    vi.spyOn(contentApi, "list").mockResolvedValue([]);
  });
  afterEach(() => vi.restoreAllMocks());

  it("muestra la portada del prototipo y navega a Mi Ruta", async () => {
    renderApp("/");
    expect(screen.getByRole("heading", { name: "Ropa para moverte, hábitos para crecer" })).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("link", { name: "Mi Ruta" })[0]);

    expect(await screen.findByRole("heading", { name: "Mi Ruta S2" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Crear cuenta gratis" })).toBeInTheDocument();
  });

  it("las páginas privadas redirigen a ingresar", () => {
    renderApp("/pedidos");
    expect(screen.getByRole("heading", { name: "Ingresar" })).toBeInTheDocument();
  });

  it("el panel de administración no se muestra a clientes", () => {
    renderApp("/admin", signedInAuth(customerProfile));
    expect(screen.getByRole("alert")).toHaveTextContent("Esta sección es solo para administración.");
  });

  it("el enlace Admin solo aparece para administradores", () => {
    const { unmount } = renderApp("/", signedInAuth());
    expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
    unmount();
    renderApp("/", signedInAuth({ ...customerProfile, role: "admin" }));
    expect(screen.getByRole("link", { name: "Admin" })).toBeInTheDocument();
  });

  it("rutas inexistentes muestran la página 404", () => {
    renderApp("/no-existe");
    expect(screen.getByRole("heading", { name: "Página no encontrada" })).toBeInTheDocument();
  });
});

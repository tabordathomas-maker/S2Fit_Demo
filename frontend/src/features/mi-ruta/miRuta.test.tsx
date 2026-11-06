import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { AppRoutes } from "../../App";
import { ApiError, apiFetch } from "../../services/api";
import { getStoredCode, storeCode } from "../../services/miRutaAccess";
import { customerProfile, fakeAuth, signedInAuth } from "../../test/utils";
import { AuthContext, type AuthContextValue } from "../auth/AuthProvider";
import { CartProvider } from "../cart/CartProvider";
import { contentApi } from "../content/api";
import { notificationsApi } from "../notifications/api";
import { miRutaApi } from "./api";
import { resetAutoRedeem } from "./useMiRutaAccess";

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

const INVALID = new ApiError(400, "invalid_code", "Código no válido o vencido");

describe("Acceso a Mi Ruta", () => {
  beforeEach(() => {
    resetAutoRedeem();
    vi.spyOn(contentApi, "list").mockResolvedValue([]);
    vi.spyOn(notificationsApi, "feed").mockResolvedValue({ items: [], unread_count: 0 });
    // Sin cuenta, el acceso depende solo de que haya un código guardado.
    vi.spyOn(miRutaApi, "access").mockImplementation(async () =>
      getStoredCode() ? { has_access: true, source: "code" } : { has_access: false, source: null },
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it("sin acceso: /mi-ruta pide el código y el menú no muestra «Mi Ruta»", async () => {
    renderApp("/mi-ruta");

    expect(await screen.findByRole("heading", { name: "Mi Ruta es para clientas S2" })).toBeInTheDocument();
    expect(screen.getByLabelText("Ingresa tu código")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir a la Tienda" })).toHaveAttribute("href", "/tienda");
    expect(screen.getAllByRole("link", { name: "Ingresar" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Mi Ruta" })).not.toBeInTheDocument();
  });

  it("escribir «k7m-2qx» y Entrar verifica «K7M2QX», lo guarda y muestra el contenido", async () => {
    const verify = vi.spyOn(miRutaApi, "verify").mockResolvedValue({ message: "Código válido." });
    renderApp("/mi-ruta");

    await userEvent.type(await screen.findByLabelText("Ingresa tu código"), "k7m-2qx");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(verify).toHaveBeenCalledWith("K7M2QX"));
    expect(getStoredCode()).toBe("K7M2QX");
    expect(await screen.findByRole("heading", { name: "Mi Ruta S2" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mi Ruta" })).toBeInTheDocument();
  });

  it("un código inválido muestra el mensaje en la misma pantalla y no se guarda", async () => {
    vi.spyOn(miRutaApi, "verify").mockRejectedValue(INVALID);
    renderApp("/mi-ruta");

    await userEvent.type(await screen.findByLabelText("Ingresa tu código"), "zzzzzz");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Código no válido o vencido");
    expect(getStoredCode()).toBeNull();
  });

  it("/mi-ruta/acceso/K7M2QX guarda el código y redirige a Mi Ruta", async () => {
    const verify = vi.spyOn(miRutaApi, "verify").mockResolvedValue({ message: "Código válido." });
    renderApp("/mi-ruta/acceso/K7M2QX");

    expect(await screen.findByRole("heading", { name: "Mi Ruta S2" })).toBeInTheDocument();
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledWith("K7M2QX");
    expect(getStoredCode()).toBe("K7M2QX");
  });

  it("/mi-ruta/acceso con un código inválido muestra el error y la pantalla del código", async () => {
    vi.spyOn(miRutaApi, "verify").mockRejectedValue(INVALID);
    renderApp("/mi-ruta/acceso/ZZZZZZ");

    expect(await screen.findByRole("alert")).toHaveTextContent("Código no válido o vencido");
    expect(screen.getByLabelText("Ingresa tu código")).toBeInTheDocument();
    expect(getStoredCode()).toBeNull();
  });

  it("con sesión y un código guardado se canjea solo en la cuenta", async () => {
    storeCode("K7M2QX");
    const redeem = vi.spyOn(miRutaApi, "redeem").mockResolvedValue({ has_access: true, source: "code" });
    renderApp("/mi-ruta", signedInAuth(customerProfile));

    await waitFor(() => expect(redeem).toHaveBeenCalledWith("K7M2QX"));
    expect(redeem).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("heading", { name: "Mi Ruta S2" })).toBeInTheDocument();
  });

  it("si el canje responde código inválido, se olvida el código guardado", async () => {
    storeCode("K7M2QX");
    vi.spyOn(miRutaApi, "redeem").mockRejectedValue(INVALID);
    renderApp("/mi-ruta", signedInAuth(customerProfile));

    await waitFor(() => expect(getStoredCode()).toBeNull());
    expect(await screen.findByLabelText("Ingresa tu código")).toBeInTheDocument();
  });
});

describe("apiFetch y el código de Mi Ruta", () => {
  const stubFetch = (status = 200, body: unknown = {}) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };
  afterEach(() => vi.unstubAllGlobals());

  const sentHeaders = (fetchMock: ReturnType<typeof stubFetch>) =>
    (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;

  it("envía X-MiRuta-Code cuando hay un código guardado", async () => {
    const fetchMock = stubFetch();
    storeCode("k7m-2qx");

    await apiFetch("/api/v1/content");

    expect(sentHeaders(fetchMock)["X-MiRuta-Code"]).toBe("K7M2QX");
  });

  it("no envía el header cuando no hay código", async () => {
    const fetchMock = stubFetch();

    await apiFetch("/api/v1/content");

    expect(sentHeaders(fetchMock)).not.toHaveProperty("X-MiRuta-Code");
  });

  it("si el backend responde mi_ruta_locked se borra el código guardado", async () => {
    stubFetch(403, { error: { code: "mi_ruta_locked", message: "Mi Ruta es para clientas S2.", details: {} } });
    storeCode("K7M2QX");

    await expect(apiFetch("/api/v1/content")).rejects.toMatchObject({ code: "mi_ruta_locked" });

    expect(getStoredCode()).toBeNull();
  });
});

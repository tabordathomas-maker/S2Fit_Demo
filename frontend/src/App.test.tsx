import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { AppRoutes } from "./App";
import { AuthContext } from "./features/auth/AuthProvider";
import { CartProvider } from "./features/cart/CartProvider";
import { customerProfile, fakeAuth, signedInAuth } from "./test/utils";

const EMPTY_HABITS = { today: { date: "2026-03-02", habits: [], completed: 0, total: 0, percent: 0 }, history: [], weekly_percent: 0 };

/** Respuestas mínimas de la API: lo justo para que las páginas pinten sin errores. */
function stubApi() {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    let body: unknown = [];
    if (url.includes("/api/v1/challenges")) body = { challenge_percent: 0, challenges: [] };
    else if (url.includes("/api/v1/rewards")) body = { habit_percent: 0, challenge_percent: 0, rewards: [] };
    else if (url.includes("/api/v1/habits")) body = EMPTY_HABITS;
    else if (url.includes("/api/v1/settings")) body = { whatsapp_number: null };
    else if (url.includes("/subscriptions/me")) body = { is_active: false, subscription: null, pending_request: null };
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
}

function renderApp(route: string, auth = fakeAuth()) {
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

describe("rutas y textos de S2 Box", () => {
  beforeEach(stubApi);
  afterEach(() => vi.unstubAllGlobals());

  it.each(["/s2-plus", "/plus"])("%s redirige a /s2-box", async (oldRoute) => {
    renderApp(oldRoute);

    expect(await screen.findByRole("heading", { level: 1, name: "S2 Box" })).toBeInTheDocument();
  });

  it("/s2-box muestra la página de S2 Box", async () => {
    renderApp("/s2-box");

    expect(await screen.findByRole("heading", { level: 1, name: "S2 Box" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "S2 Box" })).toHaveAttribute("href", "/s2-box");
  });

  it.each([
    ["inicio", "/", fakeAuth()],
    ["S2 Box", "/s2-box", fakeAuth()],
    ["Mi Ruta sin sesión", "/mi-ruta", fakeAuth()],
    ["Mi Ruta con sesión", "/mi-ruta", signedInAuth(customerProfile)],
    ["cuenta", "/cuenta", signedInAuth(customerProfile)],
  ])("ningún texto visible de %s dice «S2 Plus»", async (_name, route, auth) => {
    const { container } = renderApp(route, auth);

    await screen.findAllByRole("heading");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(container.textContent).not.toMatch(/S2 Plus/i);
  });

  it("Mi Ruta es gratis: lo dice el encabezado y no hay candados ni llamados a una membresía", async () => {
    const { container } = renderApp("/mi-ruta", signedInAuth(customerProfile));

    expect(await screen.findByText("Gratis")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(container.textContent).not.toMatch(/🔒|exclusiv|membres/i);
    expect(container.querySelector("main a[href='/s2-box']")).toBeNull();
  });
});

import type { Session } from "@supabase/supabase-js";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { AuthContext, type AuthContextValue } from "../features/auth/AuthProvider";
import { CartProvider } from "../features/cart/CartProvider";
import type { Profile } from "../services/types";

export const customerProfile: Profile = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "cliente@example.com",
  full_name: "Laura Gómez",
  phone: null,
  role: "customer",
  created_at: "2026-01-01T00:00:00Z",
};

export function fakeAuth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    configured: true,
    loading: false,
    session: null,
    profile: null,
    isAdmin: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    sendPasswordReset: vi.fn(),
    updatePassword: vi.fn(),
    refreshProfile: vi.fn(),
    ...overrides,
  };
}

export function signedInAuth(profile: Profile = customerProfile): AuthContextValue {
  return fakeAuth({
    session: { access_token: "token", user: { id: profile.id } } as unknown as Session,
    profile,
    isAdmin: profile.role === "admin",
  });
}

/** Renderiza con router en memoria, autenticación simulada y carrito real. */
export function renderWithProviders(
  ui: ReactElement,
  { auth = fakeAuth(), route = "/", path = "*" }: { auth?: AuthContextValue; route?: string; path?: string } = {},
) {
  return render(
    <AuthContext.Provider value={auth}>
      <CartProvider>
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route path={path} element={ui} />
            <Route path="/ingresar" element={<p>Página de ingreso</p>} />
          </Routes>
        </MemoryRouter>
      </CartProvider>
    </AuthContext.Provider>,
  );
}

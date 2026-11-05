import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { fakeAuth, renderWithProviders } from "../../test/utils";
import { LoginPage, RegisterPage } from "./AuthPages";

describe("Formularios de autenticación", () => {
  it("el registro envía nombre y teléfono, nunca un rol", async () => {
    const signUp = vi.fn().mockResolvedValue({ needsConfirmation: true });
    renderWithProviders(<RegisterPage />, { auth: fakeAuth({ signUp }) });

    await userEvent.type(screen.getByLabelText("Nombre completo"), "Laura Gómez");
    await userEvent.type(screen.getByLabelText("Celular (WhatsApp)"), "+573001112233");
    await userEvent.type(screen.getByLabelText("Correo"), "laura@example.com");
    await userEvent.type(screen.getByLabelText("Contraseña"), "contrasena-segura");
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));

    await waitFor(() => expect(signUp).toHaveBeenCalledWith("laura@example.com", "contrasena-segura", "Laura Gómez", "3001112233"));
    expect(await screen.findByText(/Te enviamos un correo para confirmar tu cuenta/)).toBeInTheDocument();
  });

  it("muestra el error de credenciales al ingresar", async () => {
    const signIn = vi.fn().mockRejectedValue(new Error("Correo o contraseña incorrectos."));
    renderWithProviders(<LoginPage />, { auth: fakeAuth({ signIn }) });

    await userEvent.type(screen.getByLabelText("Correo"), "laura@example.com");
    await userEvent.type(screen.getByLabelText("Contraseña"), "mala");
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Correo o contraseña incorrectos.");
  });

  it("avisa si Supabase no está configurado", () => {
    renderWithProviders(<LoginPage />, { auth: fakeAuth({ configured: false }) });
    expect(screen.getByRole("alert")).toHaveTextContent("La autenticación no está configurada");
  });
});

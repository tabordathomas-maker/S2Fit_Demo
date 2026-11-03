import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { customerProfile, renderWithProviders } from "../../test/utils";
import { adminApi, type AdminRoutineDetail } from "./api";
import { RoutinesAdmin } from "./RoutinesAdmin";

const laura = { ...customerProfile, id: "u-laura", full_name: "Laura Gómez", email: "laura@example.com", phone: "3001234567", plus_status: "none" as const, plus_ends_at: null };
const detail: AdminRoutineDetail = {
  id: 7, user_id: "u-laura", user_email: laura.email, user_name: laura.full_name, has_plus: false, plus_until: null,
  title: "Piernas", description: null, goal: null, status: "draft", sequential: true, step_count: 0, progress_pct: 0,
  created_at: "2026-03-02T15:00:00Z", steps: [],
};

describe("RoutinesAdmin", () => {
  beforeEach(() => {
    vi.spyOn(adminApi, "profiles").mockResolvedValue([laura]);
    vi.spyOn(adminApi, "subscriptions").mockResolvedValue([]);
    vi.spyOn(adminApi, "routines").mockResolvedValue([]);
  });
  afterEach(() => vi.restoreAllMocks());

  it("busca usuarios con la búsqueda escrita y muestra nombre, correo y celular con formato", async () => {
    renderWithProviders(<RoutinesAdmin />);

    await userEvent.type(screen.getByLabelText("Buscar por nombre, correo o celular"), "laura");

    await waitFor(() => expect(adminApi.profiles).toHaveBeenCalledWith("laura"));
    expect(await screen.findByText("Laura Gómez")).toBeInTheDocument();
    expect(screen.getByText(/laura@example.com · 300 123 4567/)).toBeInTheDocument();
  });

  it("avisa si la persona no tiene S2 Plus y crea la rutina para el usuario elegido", async () => {
    const create = vi.spyOn(adminApi, "createRoutine").mockResolvedValue(detail);
    vi.spyOn(adminApi, "routine").mockResolvedValue(detail);
    renderWithProviders(<RoutinesAdmin />);

    await userEvent.click(await screen.findByRole("button", { name: /Laura Gómez/ }));
    expect(await screen.findByText(/no tiene S2 Plus activa/)).toBeInTheDocument();
    expect(adminApi.routines).toHaveBeenCalledWith("u-laura");

    await userEvent.click(screen.getByRole("button", { name: "Nueva rutina" }));
    await userEvent.type(screen.getByLabelText("Título"), "Piernas");
    await userEvent.click(screen.getByRole("button", { name: "Crear rutina" }));

    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ user_id: "u-laura", title: "Piernas", sequential: true })));
    expect(await screen.findByText("Editar rutina")).toBeInTheDocument();
  });

  it("no muestra el aviso cuando la persona tiene S2 Plus activa", async () => {
    vi.spyOn(adminApi, "subscriptions").mockResolvedValue([
      { user_id: "u-laura", ends_at: "2026-12-02T15:00:00Z" } as unknown as Awaited<ReturnType<typeof adminApi.subscriptions>>[number],
    ]);
    renderWithProviders(<RoutinesAdmin />);

    await userEvent.click(await screen.findByRole("button", { name: /Laura Gómez/ }));

    expect(await screen.findByText(/S2 Plus activa hasta/)).toBeInTheDocument();
    expect(screen.queryByText(/no tiene S2 Plus activa/)).not.toBeInTheDocument();
  });
});

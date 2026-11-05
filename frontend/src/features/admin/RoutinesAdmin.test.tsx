import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { customerProfile, renderWithProviders } from "../../test/utils";
import { adminApi, type AdminRoutineDetail } from "./api";
import { RoutinesAdmin } from "./RoutinesAdmin";

const laura = { ...customerProfile, id: "u-laura", full_name: "Laura Gómez", email: "laura@example.com", phone: "3001234567", plus_status: "none" as const, plus_ends_at: null };
const detail: AdminRoutineDetail = {
  id: 7, user_id: "u-laura", user_email: laura.email, user_name: laura.full_name,
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

  it("crea la rutina para el usuario elegido, sin importar su membresía", async () => {
    const create = vi.spyOn(adminApi, "createRoutine").mockResolvedValue(detail);
    vi.spyOn(adminApi, "routine").mockResolvedValue(detail);
    renderWithProviders(<RoutinesAdmin />);

    await userEvent.click(await screen.findByRole("button", { name: /Laura Gómez/ }));
    await waitFor(() => expect(adminApi.routines).toHaveBeenCalledWith("u-laura", false));

    await userEvent.click(await screen.findByRole("button", { name: "Nueva rutina" }));
    await userEvent.type(screen.getByLabelText("Título"), "Piernas");
    await userEvent.click(screen.getByRole("button", { name: "Crear rutina" }));

    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ user_id: "u-laura", title: "Piernas", sequential: true })));
    expect(await screen.findByText("Editar rutina")).toBeInTheDocument();
  });
});

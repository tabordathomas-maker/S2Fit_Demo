import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ApiError } from "../../services/api";
import { customerProfile, renderWithProviders } from "../../test/utils";
import { adminApi, type AdminRoutine, type AdminRoutineDetail } from "./api";
import { RoutinesAdmin } from "./RoutinesAdmin";

const laura = { ...customerProfile, id: "u-laura", full_name: "Laura Gómez", email: "laura@example.com", phone: null, plus_status: "none" as const, plus_ends_at: null };
const ana = { ...laura, id: "u-ana", full_name: "Ana Ruiz", email: "ana@example.com" };

const routine = (id: number, title: string, extra: Partial<AdminRoutine> = {}): AdminRoutine => ({
  id, user_id: "u-laura", user_email: laura.email, user_name: laura.full_name, title, description: null, goal: "Tonificar",
  status: "active", sequential: true, step_count: 2, progress_pct: 0, created_at: "2026-03-02T15:00:00Z", ...extra,
});

const detail = (r: AdminRoutine): AdminRoutineDetail => ({
  ...r,
  steps: [
    { id: 1, position: 1, title: "Sentadillas", instructions: null, block_label: null, media_url: null, cover_url: null, duration_minutes: 10, sets_reps: null },
    { id: 2, position: 2, title: "Puente", instructions: null, block_label: null, media_url: null, cover_url: null, duration_minutes: null, sets_reps: null },
  ],
});

async function openLaura() {
  renderWithProviders(<RoutinesAdmin />);
  await userEvent.click(await screen.findByRole("button", { name: /Laura Gómez/ }));
}

describe("RoutinesAdmin · editar, reasignar, archivar y eliminar", () => {
  beforeEach(() => {
    vi.spyOn(adminApi, "profiles").mockResolvedValue([laura, ana]);
    vi.spyOn(adminApi, "routines").mockResolvedValue([routine(7, "Piernas")]);
    vi.spyOn(adminApi, "routine").mockResolvedValue(detail(routine(7, "Piernas")));
  });
  afterEach(() => vi.restoreAllMocks());

  it("editar precarga los datos y el PATCH solo lleva lo cambiado", async () => {
    const update = vi.spyOn(adminApi, "updateRoutine").mockResolvedValue(detail(routine(7, "Piernas", { goal: "Fuerza" })));
    await openLaura();

    await userEvent.click(await screen.findByRole("button", { name: "Editar Piernas" }));
    const goal = await screen.findByLabelText("Objetivo");
    expect(screen.getByLabelText("Título")).toHaveValue("Piernas");
    expect(goal).toHaveValue("Tonificar");
    await userEvent.clear(goal);
    await userEvent.type(goal, "Fuerza");
    await userEvent.click(screen.getByRole("button", { name: "Guardar datos" }));

    await waitFor(() => expect(update).toHaveBeenCalledWith(7, { goal: "Fuerza" }));
  });

  it("eliminar → confirmación → DELETE → la fila desaparece", async () => {
    vi.spyOn(adminApi, "routines").mockResolvedValueOnce([routine(7, "Piernas"), routine(8, "Glúteos")]).mockResolvedValue([routine(8, "Glúteos")]);
    const remove = vi.spyOn(adminApi, "deleteRoutine").mockResolvedValue(undefined);
    await openLaura();

    await userEvent.click(await screen.findByRole("button", { name: "Eliminar Piernas" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(remove).toHaveBeenCalledWith(7));
    await waitFor(() => expect(screen.queryByText("Piernas")).not.toBeInTheDocument());
    expect(screen.getByText("Glúteos")).toBeInTheDocument();
  });

  it("con progreso responde 409: muestra el mensaje y archiva en su lugar", async () => {
    const message = "Esta rutina tiene 3 avances registrados. Puedes archivarla para conservar el historial.";
    vi.spyOn(adminApi, "deleteRoutine").mockRejectedValue(new ApiError(409, "RESOURCE_IN_USE", message, { completions: 3 }));
    const archive = vi.spyOn(adminApi, "archiveRoutine").mockResolvedValue(detail(routine(7, "Piernas", { status: "archived" })));
    await openLaura();

    await userEvent.click(await screen.findByRole("button", { name: "Eliminar Piernas" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Eliminar" }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Archivar en su lugar" }));

    await waitFor(() => expect(archive).toHaveBeenCalledWith(7));
  });

  it("«Mostrar archivados» muestra y oculta las rutinas archivadas", async () => {
    vi.spyOn(adminApi, "routines").mockImplementation(async (_user, includeArchived) =>
      includeArchived ? [routine(7, "Piernas"), routine(9, "Vieja", { status: "archived" })] : [routine(7, "Piernas")]);
    await openLaura();
    await screen.findByText("Piernas");
    expect(screen.queryByText("Vieja")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("switch", { name: "Mostrar archivados" }));
    expect(await screen.findByText("Vieja")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restaurar Vieja" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("switch", { name: "Mostrar archivados" }));
    await waitFor(() => expect(screen.queryByText("Vieja")).not.toBeInTheDocument());
  });

  it("reasignar pide confirmación antes de cambiar la persona", async () => {
    const update = vi.spyOn(adminApi, "updateRoutine").mockResolvedValue(detail(routine(7, "Piernas", { user_id: "u-ana" })));
    await openLaura();

    await userEvent.click(await screen.findByRole("button", { name: "Editar Piernas" }));
    await userEvent.click(await screen.findByRole("button", { name: "Reasignar a otra persona" }));
    await userEvent.click(await screen.findByRole("button", { name: /Ana Ruiz/ }));
    expect(update).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Reasignar rutina" })).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Reasignar" }));

    await waitFor(() => expect(update).toHaveBeenCalledWith(7, { user_id: "u-ana" }));
  });

  it("subir y bajar pasos guarda el nuevo orden", async () => {
    const reorder = vi.spyOn(adminApi, "reorderRoutineSteps").mockResolvedValue(detail(routine(7, "Piernas")));
    await openLaura();

    await userEvent.click(await screen.findByRole("button", { name: "Editar Piernas" }));
    await userEvent.click(await screen.findByRole("button", { name: "Subir el paso 2" }));

    await waitFor(() => expect(reorder).toHaveBeenCalledWith(7, [2, 1]));
  });
});

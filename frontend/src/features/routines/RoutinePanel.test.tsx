import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { MembershipStatus } from "../../services/types";
import { renderWithProviders, signedInAuth } from "../../test/utils";
import { subscriptionsApi } from "../subscriptions/api";
import { routinesApi, type RoutineDetail, type RoutineStats, type RoutineSummary } from "./api";
import { RoutinePanel } from "./RoutinePanel";

const stats: RoutineStats = {
  progress_pct: 33, completed_steps: 1, total_steps: 3, total_minutes: 25, avg_effort: 4, current_streak_days: 2,
  last_completed_at: "2026-03-02T15:00:00Z", next_step: { id: 2, title: "Sentadillas" },
  weekly: Array.from({ length: 8 }, (_, i) => ({ week_start: `2026-01-${String(12 + i * 7).padStart(2, "0")}`, completions: i === 7 ? 1 : 0, minutes: i === 7 ? 25 : 0 })),
};
const summary: RoutineSummary = { id: 5, title: "Piernas", goal: "Tonificar", status: "active", locked: false, progress_pct: 33, completed_steps: 1, total_steps: 3, stats };
const detail: RoutineDetail = {
  id: 5, title: "Piernas", description: null, goal: "Tonificar", status: "active", sequential: true, locked: false, stats,
  steps: [
    { id: 1, position: 1, title: "Calentamiento", block_label: "Semana 1", sets_reps: null, duration_minutes: 10, instructions: null, media_url: null, cover_url: null, state: "done",
      completion: { completed_at: "2026-03-02T15:00:00Z", minutes: 25, effort: 4, note: null } },
    { id: 2, position: 2, title: "Sentadillas", block_label: "Semana 1", sets_reps: "3 × 12", duration_minutes: 15, instructions: "Baja despacio", media_url: null, cover_url: null, state: "current", completion: null },
    { id: 3, position: 3, title: "Puente de glúteos", block_label: "Semana 2", sets_reps: null, duration_minutes: null, instructions: "No debería verse", media_url: null, cover_url: null, state: "locked", completion: null },
  ],
};
const noMembership: MembershipStatus = { is_active: false, subscription: null, pending_request: null };

describe("RoutinePanel", () => {
  beforeEach(() => {
    vi.spyOn(subscriptionsApi, "membership").mockResolvedValue(noMembership);
  });
  afterEach(() => vi.restoreAllMocks());

  it("pinta el roadmap con los estados done, current y locked, y un paso bloqueado no se abre", async () => {
    vi.spyOn(routinesApi, "list").mockResolvedValue([summary]);
    vi.spyOn(routinesApi, "get").mockResolvedValue(detail);
    renderWithProviders(<RoutinePanel />, { auth: signedInAuth() });

    expect(await screen.findByRole("button", { name: "Paso 1: Calentamiento, completado" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Paso 2: Sentadillas, siguiente paso" })).toBeEnabled();
    const locked = screen.getByRole("button", { name: "Paso 3: Puente de glúteos, bloqueado" });
    expect(locked).toBeDisabled();
    expect(screen.getByText("Siguiente paso")).toBeInTheDocument();
    expect(screen.getByText("Semana 1")).toBeInTheDocument();
    expect(screen.getByText("Semana 2")).toBeInTheDocument();

    await userEvent.click(locked);
    expect(screen.queryByText("No debería verse")).not.toBeInTheDocument();
  });

  it("muestra las estadísticas del backend", async () => {
    vi.spyOn(routinesApi, "list").mockResolvedValue([summary]);
    vi.spyOn(routinesApi, "get").mockResolvedValue(detail);
    renderWithProviders(<RoutinePanel />, { auth: signedInAuth() });

    expect(await screen.findByText("1/3")).toBeInTheDocument();
    expect(screen.getByText("2 días")).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
    expect(screen.getByText("4 / 5")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Avance de la rutina" })).toHaveAttribute("aria-valuenow", "33");
    expect(screen.getAllByRole("img", { name: /^Semana del/ })).toHaveLength(8);
  });

  it("completar un paso llama a la API y vuelve a cargar los datos", async () => {
    vi.spyOn(routinesApi, "list").mockResolvedValue([summary]);
    const get = vi.spyOn(routinesApi, "get").mockResolvedValue(detail);
    const complete = vi.spyOn(routinesApi, "complete").mockResolvedValue(detail);
    renderWithProviders(<RoutinePanel />, { auth: signedInAuth() });

    await userEvent.click(await screen.findByRole("button", { name: "Paso 2: Sentadillas, siguiente paso" }));
    expect(screen.getByText("Baja despacio")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Minutos (opcional)"), "20");
    await userEvent.click(screen.getByRole("button", { name: "Esfuerzo 4" }));
    await userEvent.click(screen.getByRole("button", { name: "Marcar como completado" }));

    await waitFor(() => expect(complete).toHaveBeenCalledWith(5, 2, { minutes: 20, effort: 4, note: null }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  it("un paso completado permite deshacer", async () => {
    vi.spyOn(routinesApi, "list").mockResolvedValue([summary]);
    vi.spyOn(routinesApi, "get").mockResolvedValue(detail);
    const undo = vi.spyOn(routinesApi, "undo").mockResolvedValue(detail);
    renderWithProviders(<RoutinePanel />, { auth: signedInAuth() });

    await userEvent.click(await screen.findByRole("button", { name: "Paso 1: Calentamiento, completado" }));
    await userEvent.click(screen.getByRole("button", { name: "Deshacer" }));

    await waitFor(() => expect(undo).toHaveBeenCalledWith(5, 1));
  });

  it("sin S2 Plus muestra el aviso y el botón a /plus, y no pide el detalle", async () => {
    vi.spyOn(routinesApi, "list").mockResolvedValue([{ ...summary, locked: true, stats: null }]);
    const get = vi.spyOn(routinesApi, "get");
    renderWithProviders(<RoutinePanel />, { auth: signedInAuth() });

    expect(await screen.findByText("Tu rutina personalizada es parte de S2 Plus")).toBeInTheDocument();
    expect(screen.getByText("Piernas")).toBeInTheDocument();
    expect(screen.getByText("33% de avance")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Conocer S2 Plus" })).toHaveAttribute("href", "/plus");
    expect(get).not.toHaveBeenCalled();
  });

  it("ofrece renovar si la persona ya tuvo membresía", async () => {
    vi.spyOn(routinesApi, "list").mockResolvedValue([{ ...summary, locked: true, stats: null }]);
    vi.spyOn(subscriptionsApi, "membership").mockResolvedValue({ ...noMembership, subscription: { id: "s1" } as MembershipStatus["subscription"] });
    renderWithProviders(<RoutinePanel />, { auth: signedInAuth() });

    expect(await screen.findByRole("link", { name: "Renovar S2 Plus" })).toHaveAttribute("href", "/plus");
  });

  it("no muestra nada si no hay rutinas", async () => {
    vi.spyOn(routinesApi, "list").mockResolvedValue([]);
    const { container } = renderWithProviders(<RoutinePanel />, { auth: signedInAuth() });

    await waitFor(() => expect(routinesApi.list).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

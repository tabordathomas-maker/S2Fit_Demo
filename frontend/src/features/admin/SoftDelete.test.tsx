import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DeleteDialog } from "../../components/admin/DeleteDialog";
import type { Usage } from "../../components/admin/usage";
import { ApiError } from "../../services/api";
import type { Plan } from "../../services/types";
import { renderWithProviders } from "../../test/utils";
import { adminApi } from "./api";
import { MembershipsAdmin } from "./MembershipsAdmin";

const open = (props: Partial<Parameters<typeof DeleteDialog>[0]> & { usage?: Usage }) => {
  const remove = vi.fn().mockResolvedValue(undefined);
  const archive = vi.fn().mockResolvedValue(undefined);
  const onDone = vi.fn();
  render(<DeleteDialog target={{ name: "S2 Box mensual" }} noun="plan" remove={remove} archive={archive} onClose={vi.fn()} onDone={onDone} {...props} />);
  return { remove, archive, onDone };
};

describe("DeleteDialog · eliminación lógica", () => {
  it("con algo vigente abre en «No se puede eliminar», no llama a borrar y «Archivar» archiva", async () => {
    const { remove, archive, onDone } = open({ usage: { live: { subscriptions_active: 1, requests_pending: 1 }, historical: { subscriptions: 2 } } });

    const dialog = screen.getByRole("dialog", { name: "No se puede eliminar" });
    expect(within(dialog).getByText(/Este plan tiene 1 suscripción activa y 1 solicitud esperando pago/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Eliminar" })).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Archivar" }));

    await waitFor(() => expect(archive).toHaveBeenCalledTimes(1));
    expect(remove).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledWith("archived");
  });

  it("con solo historial avisa que se conserva y al confirmar llama a borrar", async () => {
    const { remove, onDone } = open({ usage: { live: {}, historical: { subscriptions: 2, requests: 1 } } });

    expect(screen.getByText("Se quitará del panel y de la página. El historial (2 suscripciones anteriores y 1 solicitud anterior) se conserva.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    expect(onDone).toHaveBeenCalledWith("deleted");
  });

  it("sin uso muestra la confirmación de siempre", () => {
    open({ usage: { live: {}, historical: {} } });

    expect(screen.getByText(/¿Seguro que quieres eliminar «S2 Box mensual»\?/)).toBeInTheDocument();
  });

  it("un 409 inesperado cambia al modo «No se puede eliminar» con el mensaje del backend", async () => {
    const message = "Este plan tiene 1 suscripción activa (vence el 12 dic 2026). Puedes archivarlo para que deje de ofrecerse.";
    const { archive } = open({ remove: vi.fn().mockRejectedValue(new ApiError(409, "RESOURCE_IN_USE", message, { live: { subscriptions_active: 1 } })) });

    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    expect(await screen.findByRole("dialog", { name: "No se puede eliminar" })).toBeInTheDocument();
    expect(screen.getByText(message)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Archivar en su lugar" }));
    await waitFor(() => expect(archive).toHaveBeenCalled());
  });
});

const plan = (id: number, name: string, extra: Partial<Plan> = {}): Plan => ({
  id, code: `plan-${id}`, name, description: null, price: 60000, duration_days: 30, period_label: "mensual", benefits: [], is_active: true, ...extra,
});

describe("Lista de planes · Mostrar eliminados y Restaurar", () => {
  beforeEach(() => {
    vi.spyOn(adminApi, "subscriptionRequests").mockResolvedValue([]);
    vi.spyOn(adminApi, "subscriptions").mockResolvedValue([]);
    vi.spyOn(adminApi, "profiles").mockResolvedValue([]);
  });
  afterEach(() => vi.restoreAllMocks());

  it("«Mostrar eliminados» trae los eliminados con su etiqueta y «Restaurar» los devuelve", async () => {
    const list = vi.spyOn(adminApi, "plans").mockImplementation(async (_archived, deleted) =>
      deleted ? [plan(1, "S2 Box mensual"), plan(2, "Plan viejo", { is_active: false, deleted_at: "2026-11-01T10:00:00Z" })] : [plan(1, "S2 Box mensual")]);
    const restore = vi.spyOn(adminApi, "restorePlan").mockResolvedValue(plan(2, "Plan viejo"));
    renderWithProviders(<MembershipsAdmin />);
    await screen.findByLabelText("Nombre", { selector: "#pn-1" });
    expect(screen.queryByLabelText("Nombre", { selector: "#pn-2" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("switch", { name: "Mostrar eliminados" }));
    expect(await screen.findByLabelText("Nombre", { selector: "#pn-2" })).toHaveValue("Plan viejo");
    expect(screen.getByText("Eliminado")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Restaurar Plan viejo" }));

    await waitFor(() => expect(restore).toHaveBeenCalledWith(2));
    expect(list).toHaveBeenCalledWith(false, true);
  });

  it("un plan con suscripción vigente abre «No se puede eliminar» sin llamar a DELETE", async () => {
    vi.spyOn(adminApi, "plans").mockResolvedValue([plan(1, "S2 Box mensual", { in_use: true, usage: { live: { subscriptions_active: 1 }, historical: {} } })]);
    const remove = vi.spyOn(adminApi, "deletePlan").mockResolvedValue(undefined);
    renderWithProviders(<MembershipsAdmin />);

    await userEvent.click(await screen.findByRole("button", { name: "Eliminar S2 Box mensual" }));

    expect(screen.getByRole("dialog", { name: "No se puede eliminar" })).toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();
  });
});

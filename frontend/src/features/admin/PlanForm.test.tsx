import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ApiError } from "../../services/api";
import { slugifyCode, normalizePlanName } from "../../services/planCode";
import type { Plan } from "../../services/types";
import { renderWithProviders } from "../../test/utils";
import { adminApi } from "./api";
import { MembershipsAdmin } from "./MembershipsAdmin";
import { PlanForm } from "./PlanForm";

describe("slugifyCode (misma regla que el backend)", () => {
  it.each([
    ["S2 Box Mamá & Hija", "s2-box-mama-hija"],
    ["Plan Básico", "plan-basico"],
    ["🎁✨", "plan"],
    ["&&&", "plan"],
    ["a", "plan"],
    ["--Ñandú--", "nandu"],
  ])("%s → %s", (name, code) => expect(slugifyCode(name)).toBe(code));

  it("recorta a 40 caracteres sin guion final", () => {
    const code = slugifyCode("Árbol de la vida y de la salud para toda la familia entera ".repeat(2));

    expect(code.length).toBeLessThanOrEqual(40);
    expect(code.endsWith("-")).toBe(false);
    expect(code.startsWith("arbol-de-la-vida")).toBe(true);
  });

  it("normalizePlanName colapsa espacios", () => expect(normalizePlanName("  S2   Box  Anual ")).toBe("S2 Box Anual"));
});

const submitMock = () => vi.fn<(body: Record<string, unknown>) => Promise<void>>().mockResolvedValue(undefined);

describe("PlanForm · crear", () => {
  it("el código se genera al escribir y se envía solo si el admin lo editó", async () => {
    const onSubmit = submitMock();
    renderWithProviders(<PlanForm mode="create" onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText("Nombre"), "S2 Box Mamá & Hija");
    expect(screen.getByText("s2-box-mama-hija", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByLabelText("Código")).toHaveValue("s2-box-mama-hija");
    await userEvent.click(screen.getByRole("button", { name: "Crear plan" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: "S2 Box Mamá & Hija", duration_days: 30, period_label: "mensual", price: null });
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty("code");
  });

  it("deja de autocompletarse cuando el admin edita el código a mano", async () => {
    const onSubmit = submitMock();
    renderWithProviders(<PlanForm mode="create" onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText("Nombre"), "Plan Uno");
    const code = screen.getByLabelText("Código");
    await userEvent.clear(code);
    await userEvent.type(code, "mi-codigo");
    await userEvent.type(screen.getByLabelText("Nombre"), " Extra");

    expect(screen.getByLabelText("Código")).toHaveValue("mi-codigo");
    await userEvent.click(screen.getByRole("button", { name: "Crear plan" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ code: "mi-codigo" })));
  });

  it("muestra el contador N/80 y la vista previa con precio, duración y beneficios", async () => {
    renderWithProviders(<PlanForm mode="create" onSubmit={submitMock()} />);

    await userEvent.type(screen.getByLabelText("Nombre"), "Anual Plus");
    await userEvent.type(screen.getByLabelText("Precio (COP)"), "1250000");
    await userEvent.selectOptions(screen.getByLabelText("Duración"), "anual");
    await userEvent.click(screen.getByRole("button", { name: "Agregar beneficio" }));
    await userEvent.type(screen.getByLabelText("Beneficio 1"), "Caja mensual");

    expect(screen.getByText(/10\/80/)).toBeInTheDocument();
    expect(screen.getByLabelText("Precio (COP)")).toHaveValue("1.250.000");
    const preview = screen.getByLabelText("Vista previa de la tarjeta del plan");
    expect(preview).toHaveTextContent("Anual Plus");
    expect(preview).toHaveTextContent("$1.250.000 COP · anual");
    expect(preview).toHaveTextContent("Vigencia: 365 días");
    expect(preview).toHaveTextContent("Caja mensual");
  });

  it("con «Ocultar precio» la vista previa dice «Precio por confirmar»", async () => {
    renderWithProviders(<PlanForm mode="create" onSubmit={submitMock()} />);

    await userEvent.type(screen.getByLabelText("Precio (COP)"), "50000");
    await userEvent.click(screen.getByRole("checkbox", { name: /Ocultar el precio al público/ }));

    expect(screen.getByLabelText("Vista previa de la tarjeta del plan")).toHaveTextContent("Precio por confirmar");
  });

  it("el 409 PLAN_NAME_TAKEN se muestra junto al nombre", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(409, "PLAN_NAME_TAKEN", "Ya existe un plan llamado «Mensual». Usa otro nombre."));
    renderWithProviders(<PlanForm mode="create" onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText("Nombre"), "Mensual");
    await userEvent.click(screen.getByRole("button", { name: "Crear plan" }));

    const message = await screen.findByText("Ya existe un plan llamado «Mensual». Usa otro nombre.");
    expect(message).toHaveAttribute("role", "alert");
    expect(screen.getByLabelText("Nombre")).toHaveAttribute("aria-invalid", "true");
  });
});

const plan: Plan = {
  id: 1, code: "mensual", name: "Mensual", description: null, price: 60000, duration_days: 30, period_label: "mensual",
  benefits: ["Retos"], is_active: true, hide_price: false, sort_order: 0,
};

describe("PlanForm · editar", () => {
  it("con historial el código está deshabilitado y explica por qué", () => {
    renderWithProviders(<PlanForm mode="edit" plan={plan} codeLocked onSubmit={submitMock()} />);

    expect(screen.getByLabelText("Código")).toBeDisabled();
    expect(screen.getByText("El código no se puede cambiar porque el plan ya tiene historial.")).toBeInTheDocument();
  });

  it("precarga y envía el PATCH solo con lo cambiado", async () => {
    const onSubmit = submitMock();
    renderWithProviders(<PlanForm mode="edit" plan={plan} onSubmit={onSubmit} />);

    expect(screen.getByLabelText("Nombre")).toHaveValue("Mensual");
    await userEvent.clear(screen.getByLabelText("Precio (COP)"));
    await userEvent.click(screen.getByRole("button", { name: "Guardar plan" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ clear_price: true }));
  });

  it("el beneficio se puede subir, bajar y quitar", async () => {
    const onSubmit = submitMock();
    renderWithProviders(<PlanForm mode="edit" plan={{ ...plan, benefits: ["A", "B"] }} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole("button", { name: "Subir beneficio 2" }));
    await userEvent.click(screen.getByRole("button", { name: "Quitar beneficio 2" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar plan" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ benefits: ["B"] }));
  });
});

describe("Admin → S2 Box → Planes sin planes", () => {
  afterEach(() => vi.restoreAllMocks());

  it("muestra «Aún no hay planes. Crea el primero.» y el botón abre el formulario", async () => {
    vi.spyOn(adminApi, "plans").mockResolvedValue([]);
    vi.spyOn(adminApi, "subscriptionRequests").mockResolvedValue([]);
    vi.spyOn(adminApi, "subscriptions").mockResolvedValue([]);
    vi.spyOn(adminApi, "profiles").mockResolvedValue([]);
    const create = vi.spyOn(adminApi, "createPlan").mockResolvedValue({ ...plan });
    renderWithProviders(<MembershipsAdmin />);

    expect(await screen.findByText("Aún no hay planes. Crea el primero.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Crear plan" }));
    await userEvent.type(screen.getByLabelText("Nombre"), "Mensual");
    await userEvent.click(screen.getByRole("button", { name: "Crear plan" }));

    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: "Mensual" })));
  });
});

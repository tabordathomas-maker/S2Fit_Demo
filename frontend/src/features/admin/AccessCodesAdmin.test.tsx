import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { config } from "../../config";
import { renderWithProviders } from "../../test/utils";
import { AccessCodesAdmin } from "./AccessCodesAdmin";
import { adminApi, type AccessCode } from "./api";

const code = (id: number, value: string, extra: Partial<AccessCode> = {}): AccessCode => ({
  id, code: value, note: null, phone: null, is_active: true, expires_at: null, used_count: 0, last_used_at: null,
  created_at: "2026-03-02T15:00:00Z", status: "active", linked_email: null, linked_name: null, ...extra,
});

const THREE = [code(1, "AAAAAA", { note: "Feria" }), code(2, "BBBBBB"), code(3, "CCCCCC")];

describe("AccessCodesAdmin", () => {
  beforeEach(() => {
    // jsdom no dibuja canvas: basta con que no falle.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  });
  afterEach(() => vi.restoreAllMocks());

  it("generar 3 códigos llama a la API y muestra 3 QR", async () => {
    const list = vi.spyOn(adminApi, "accessCodes").mockResolvedValueOnce([]).mockResolvedValue(THREE);
    const create = vi.spyOn(adminApi, "createAccessCodes").mockResolvedValue(THREE);
    renderWithProviders(<AccessCodesAdmin />);
    await screen.findByText("No hay códigos con esos filtros.");

    const quantity = screen.getByLabelText("Cantidad (1 a 50)");
    await userEvent.clear(quantity);
    await userEvent.type(quantity, "3");
    await userEvent.type(screen.getByLabelText("Nota (cliente o venta, opcional)"), "Feria");
    await userEvent.click(screen.getByRole("button", { name: "Generar códigos" }));

    await waitFor(() => expect(create).toHaveBeenCalledWith({ quantity: 3, note: "Feria", phone: null, expires_at: null }));
    expect(await screen.findAllByLabelText(/^QR del código /)).toHaveLength(3);
    expect(screen.getByText("3 códigos generados.")).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("rechaza una cantidad fuera de 1 a 50 sin llamar a la API", async () => {
    vi.spyOn(adminApi, "accessCodes").mockResolvedValue([]);
    const create = vi.spyOn(adminApi, "createAccessCodes").mockResolvedValue([]);
    renderWithProviders(<AccessCodesAdmin />);

    const quantity = await screen.findByLabelText("Cantidad (1 a 50)");
    await userEvent.clear(quantity);
    await userEvent.type(quantity, "51");
    await userEvent.click(screen.getByRole("button", { name: "Generar códigos" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Elige entre 1 y 50 códigos.");
    expect(create).not.toHaveBeenCalled();
  });

  it("descargar PNG baja el QR con el nombre S2-MiRuta-CODIGO.png", async () => {
    vi.spyOn(adminApi, "accessCodes").mockResolvedValue(THREE);
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,AAA");
    const downloaded: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloaded.push(`${this.download}|${this.href}`);
    });
    renderWithProviders(<AccessCodesAdmin />);

    await userEvent.click(await screen.findByRole("button", { name: "Descargar QR AAAAAA" }));

    expect(toDataURL).toHaveBeenCalledWith("image/png");
    expect(downloaded).toEqual(["S2-MiRuta-AAAAAA.png|data:image/png;base64,AAA"]);
  });

  it("copiar enlace copia la dirección de acceso del código", async () => {
    vi.spyOn(adminApi, "accessCodes").mockResolvedValue(THREE);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderWithProviders(<AccessCodesAdmin />);

    await userEvent.click(await screen.findByRole("button", { name: "Copiar enlace BBBBBB" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}${config.baseUrl}#/mi-ruta/acceso/BBBBBB`));
    expect(await screen.findByText("Enlace del código BBBBBB copiado.")).toBeInTheDocument();
  });

  it("desactivar un código llama a la API", async () => {
    vi.spyOn(adminApi, "accessCodes").mockResolvedValue(THREE);
    const update = vi.spyOn(adminApi, "updateAccessCode").mockResolvedValue(code(1, "AAAAAA", { is_active: false, status: "inactive" }));
    renderWithProviders(<AccessCodesAdmin />);

    await userEvent.click(await screen.findByRole("button", { name: "Desactivar AAAAAA" }));

    await waitFor(() => expect(update).toHaveBeenCalledWith(1, { is_active: false }));
    expect(await screen.findByText("Código AAAAAA desactivado.")).toBeInTheDocument();
  });

  it("un código nunca usado se elimina tras confirmar; uno usado solo se puede desactivar", async () => {
    vi.spyOn(adminApi, "accessCodes").mockResolvedValue([code(1, "AAAAAA"), code(2, "BBBBBB", { used_count: 2, linked_email: "laura@example.com" })]);
    const remove = vi.spyOn(adminApi, "deleteAccessCode").mockResolvedValue(undefined);
    renderWithProviders(<AccessCodesAdmin />);

    expect(await screen.findByRole("button", { name: "Eliminar AAAAAA" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Eliminar BBBBBB" })).not.toBeInTheDocument();
    expect(screen.getByText("laura@example.com")).toBeInTheDocument();
    expect(screen.getByText("Ya se usó: solo se puede desactivar.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Eliminar AAAAAA" }));
    await userEvent.click(within_dialog());

    await waitFor(() => expect(remove).toHaveBeenCalledWith(1));
  });
});

/** El botón «Eliminar» del diálogo de confirmación (el último con ese nombre). */
function within_dialog(): HTMLElement {
  const buttons = screen.getAllByRole("button", { name: "Eliminar" });
  return buttons[buttons.length - 1];
}

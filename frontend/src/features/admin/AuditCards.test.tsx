import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AuditEventCard } from "../../components/admin/AuditEventCard";
import { ClientAuditCard } from "../../components/admin/ClientAuditCard";
import { toCsv } from "../../services/csv";
import { renderWithProviders } from "../../test/utils";
import { adminApi, type AuditClient, type AuditEvent } from "./api";
import { UsersAdmin } from "./UsersAdmin";

const event = (id: number, extra: Partial<AuditEvent> = {}): AuditEvent => ({
  id, when: "5 nov 2026, 3:40 p. m.", admin: "Thomas", category: "Catálogo", action: "product.update", phrase: "editó el producto «Set Ocean»",
  entity: { type: "Producto", name: "Set Ocean" }, changes: [{ field: "Precio", before: "$140.000", after: "$145.000" }], reference: null, ...extra,
});

const client: AuditClient = {
  id: "c1", name: "Laura Gómez", email: "laura@example.com", phone: "3001234567", last_activity: "5 nov 2026, 4:12 p. m.",
  orders: [{
    reference: "S2-ORD-0012", total: 125000, status: { label: "Pagado", tone: "success" }, payment: { label: "Confirmado", tone: "success" }, reserved_until: null,
    events: [event(2, { category: "Pagos", phrase: "confirmó el pago de S2-ORD-0012 ($125.000)", changes: [{ field: "Estado", before: "Pendiente", after: "Confirmado" }] })],
  }],
  requests: [{ reference: "S2-SUB-0003", plan: "S2 Box Trimestral", agreed_price: 150000, status: { label: "Pagada", tone: "success" }, payment: { label: "Confirmado", tone: "success" }, events: [] }],
  subscription: { plan: "S2 Box Trimestral", status: { label: "Activa", tone: "success" }, text: "Activa hasta 5 feb 2027", events: [] },
};

describe("AuditEventCard", () => {
  it("muestra «Catálogo · Set Ocean», la fecha, el admin y el cambio con valores legibles, sin JSON", () => {
    const { container } = render(<ul><AuditEventCard event={event(1)} /></ul>);

    expect(screen.getByRole("heading", { name: "Catálogo · Set Ocean" })).toBeInTheDocument();
    expect(screen.getByText("5 nov 2026, 3:40 p. m. · Thomas")).toBeInTheDocument();
    expect(screen.getByText("Thomas editó el producto «Set Ocean».")).toBeInTheDocument();
    expect(screen.getByText("Precio:", { selector: "strong" }).parentElement).toHaveTextContent("Precio: $140.000 → $145.000");
    expect(container.textContent).not.toContain("{");
  });
});

describe("ClientAuditCard", () => {
  it("muestra cliente, referencias con monto, estados con texto y el historial con tabla de cambios", async () => {
    render(<ul><ClientAuditCard client={client} /></ul>);

    expect(screen.getByRole("heading", { name: "Cliente · Laura Gómez" })).toBeInTheDocument();
    expect(screen.getByText("laura@example.com · 300 123 4567")).toBeInTheDocument();
    const order = screen.getByLabelText("S2-ORD-0012");
    expect(within(order).getByText("S2-ORD-0012 · $125.000")).toBeInTheDocument();
    expect(within(order).getByText(/Pago ·/)).toHaveTextContent("Confirmado");
    expect(within(order).getByText(/Pedido ·/)).toHaveTextContent("Pagado");
    const sub = screen.getByLabelText("Suscripción");
    expect(sub).toHaveTextContent("Suscripción · Activa");
    expect(sub).toHaveTextContent("Activa hasta 5 feb 2027");
    expect(screen.getByLabelText("S2-SUB-0003")).toHaveTextContent("S2-SUB-0003 · S2 Box Trimestral · $150.000");

    await userEvent.click(within(order).getByText("Ver historial (1)"));
    expect(within(order).getByText("Thomas confirmó el pago de S2-ORD-0012 ($125.000).")).toBeInTheDocument();
    const table = within(order).getByRole("table");
    expect(within(table).getByText("Estado")).toBeInTheDocument();
    expect(within(table).getByText("Pendiente")).toBeInTheDocument();
  });
});

describe("toCsv", () => {
  it("usa «;» como separador, escapa comillas y empieza con BOM UTF-8", () => {
    const csv = toCsv([["Cliente", "Monto"], ["Laura «L»; \"G\"", 125000]]);

    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.split("\r\n")[0]).toBe("﻿Cliente;Monto");
    expect(csv.split("\r\n")[1]).toBe('"Laura «L»; ""G""";125000');
  });
});

describe("UsersAdmin · Auditoría", () => {
  beforeEach(() => {
    vi.spyOn(adminApi, "profiles").mockResolvedValue([]);
    vi.spyOn(adminApi, "auditClients").mockResolvedValue({ total: 1, clients: [client] });
    vi.spyOn(adminApi, "auditEvents").mockResolvedValue({ total: 1, events: [event(1)] });
  });
  afterEach(() => vi.restoreAllMocks());

  it("empieza en «Clientes» y cambiar de vista y los filtros envía los parámetros", async () => {
    renderWithProviders(<UsersAdmin />);
    expect(await screen.findByRole("heading", { name: "Cliente · Laura Gómez" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Todo el registro" }));
    expect(await screen.findByRole("heading", { name: "Catálogo · Set Ocean" })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Categoría"), "Pagos");
    await userEvent.type(screen.getByLabelText("Desde"), "2026-11-01");

    await waitFor(() => expect(adminApi.auditEvents).toHaveBeenLastCalledWith(expect.objectContaining({ category: "Pagos", from: "2026-11-01", offset: 0 })));
  });

  it("«Cargar más» pide la siguiente página", async () => {
    const more = vi.spyOn(adminApi, "auditClients");
    more.mockResolvedValueOnce({ total: 2, clients: [client] }).mockResolvedValueOnce({ total: 2, clients: [{ ...client, id: "c2", name: "Ana Ruiz" }] });
    renderWithProviders(<UsersAdmin />);

    await userEvent.click(await screen.findByRole("button", { name: "Cargar más" }));

    expect(await screen.findByRole("heading", { name: "Cliente · Ana Ruiz" })).toBeInTheDocument();
    expect(more).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 1 }));
  });

  it("«Exportar CSV» descarga un archivo con BOM y «;»", async () => {
    let blob: Blob | undefined;
    vi.spyOn(URL, "createObjectURL").mockImplementation((b) => { blob = b as Blob; return "blob:x"; });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderWithProviders(<UsersAdmin />);

    await userEvent.click(await screen.findByRole("button", { name: "Exportar CSV" }));

    const buffer = await new Promise<ArrayBuffer>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(blob!);
    });
    const bytes = new Uint8Array(buffer);
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
    expect(text).toContain("Cliente;Correo;Celular;Referencia;Tipo;Monto;Estado;Última actualización");
    expect(text).toContain("Laura Gómez;laura@example.com;3001234567;S2-ORD-0012;Pedido;125000");
  });

  it("estado vacío amable y ningún JSON visible", async () => {
    vi.spyOn(adminApi, "auditClients").mockResolvedValue({ total: 0, clients: [] });
    const { container } = renderWithProviders(<UsersAdmin />);

    expect(await screen.findByText("No hay actividad de clientes con estos filtros.")).toBeInTheDocument();
    expect(container.textContent).not.toContain("{");
  });
});

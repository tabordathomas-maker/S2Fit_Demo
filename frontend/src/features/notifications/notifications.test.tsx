import { act, fireEvent, screen } from "@testing-library/react";

import { Header } from "../../components/Header";
import { customerProfile, fakeAuth, renderWithProviders, signedInAuth } from "../../test/utils";
import { notificationsApi, type NotificationFeed, type NotificationItem } from "./api";
import { POLL_MS, TOAST_MS } from "./NotificationsProvider";

vi.mock("./api", () => ({ notificationsApi: { feed: vi.fn(), markSeen: vi.fn() } }));

const feedMock = vi.mocked(notificationsApi.feed);
const seenMock = vi.mocked(notificationsApi.markSeen);

function item(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: "order:S2-ORD-AAAA1111",
    kind: "order",
    reference: "S2-ORD-AAAA1111",
    title: "Pedido",
    status: "accepted",
    status_label: "Aceptado",
    occurred_at: "2026-03-02T15:00:00Z",
    link: "/pedidos",
    unread: true,
    ...overrides,
  };
}

const twoUnread: NotificationFeed = {
  unread_count: 2,
  items: [
    item(),
    item({ id: "box_claim:S2-BOX-BBBB2222", kind: "box_claim", reference: "S2-BOX-BBBB2222", title: "Reclamo de S2 Box", status: "rejected", status_label: "Rechazado" }),
  ],
};

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  feedMock.mockReset();
  seenMock.mockReset();
  seenMock.mockResolvedValue({ items: [], unread_count: 0 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Campanita de notificaciones", () => {
  it("no se muestra sin sesión y no consulta la API", async () => {
    renderWithProviders(<Header />, { auth: fakeAuth() });
    await flush();

    expect(screen.queryByRole("button", { name: /Notificaciones/ })).not.toBeInTheDocument();
    expect(feedMock).not.toHaveBeenCalled();
  });

  it("muestra la insignia con el número de no leídos", async () => {
    feedMock.mockResolvedValue(twoUnread);
    renderWithProviders(<Header />, { auth: signedInAuth() });
    await flush();

    const bell = screen.getByRole("button", { name: "Notificaciones (2 sin leer)" });
    expect(bell).toHaveTextContent("2");
  });

  it("al abrir el panel lista los elementos con su estado y llama a /seen", async () => {
    feedMock.mockResolvedValue(twoUnread);
    renderWithProviders(<Header />, { auth: signedInAuth() });
    await flush();

    fireEvent.click(screen.getByRole("button", { name: /Notificaciones/ }));
    await flush();

    expect(seenMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("S2-ORD-AAAA1111")).toBeInTheDocument();
    expect(screen.getByText("Aceptado")).toBeInTheDocument();
    expect(screen.getByText("Rechazado")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /S2-ORD-AAAA1111/ })).toHaveAttribute("href", "/pedidos");
    expect(screen.getByRole("button", { name: "Notificaciones (0 sin leer)" })).toBeInTheDocument();
  });

  it("Esc cierra el panel", async () => {
    feedMock.mockResolvedValue({ items: [item({ unread: false })], unread_count: 0 });
    renderWithProviders(<Header />, { auth: signedInAuth() });
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /Notificaciones/ }));
    expect(screen.getByRole("region", { name: "Notificaciones" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("region", { name: "Notificaciones" })).not.toBeInTheDocument();
  });

  it("un elemento nuevo en la siguiente consulta muestra el aviso flotante, que se cierra solo", async () => {
    feedMock.mockResolvedValueOnce({ items: [], unread_count: 0 });
    renderWithProviders(<Header />, { auth: signedInAuth(customerProfile) });
    await flush();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    feedMock.mockResolvedValue({ items: [item()], unread_count: 1 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });

    expect(screen.getByRole("status")).toHaveTextContent("Tu pedido S2-ORD-AAAA1111 fue aceptado");
    expect(screen.getByRole("button", { name: "Cerrar" })).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TOAST_MS);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("el aviso al admin dice qué llegó", async () => {
    const admin = signedInAuth({ ...customerProfile, role: "admin" });
    feedMock.mockResolvedValueOnce({ items: [], unread_count: 0 });
    renderWithProviders(<Header />, { auth: admin });
    await flush();

    feedMock.mockResolvedValue({
      items: [item({ title: "Nuevo pedido", status: "pending", status_label: "Pendiente" })],
      unread_count: 1,
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });

    expect(screen.getByRole("status")).toHaveTextContent("Nuevo pedido S2-ORD-AAAA1111");
  });

  it("un error de la API no rompe el Header", async () => {
    feedMock.mockRejectedValue(new Error("Servidor dormido"));
    renderWithProviders(<Header />, { auth: signedInAuth() });
    await flush();

    expect(screen.getAllByRole("link", { name: /Bolsa/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Notificaciones (0 sin leer)" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("no consulta cada 60 s si la pestaña está oculta", async () => {
    feedMock.mockResolvedValue({ items: [], unread_count: 0 });
    renderWithProviders(<Header />, { auth: signedInAuth() });
    await flush();
    const spy = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    });

    expect(feedMock).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

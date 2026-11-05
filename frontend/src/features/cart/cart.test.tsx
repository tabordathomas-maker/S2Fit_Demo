import { act, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import { config } from "../../config";
import { ApiError } from "../../services/api";
import type { OrderWithMessage } from "../../services/types";
import { navigation } from "../../services/whatsapp";
import { renderWithProviders, signedInAuth } from "../../test/utils";
import { ordersApi } from "../orders/api";
import { CartPage } from "./CartPage";
import { CartProvider, useCart, type CartLine } from "./CartProvider";

const line: CartLine = {
  variantId: 7,
  productSlug: "set-lila",
  productName: "Set lila",
  variantLabel: "Talla M · Lila",
  imageUrl: null,
  displayPrice: 145000,
  quantity: 1,
  maxQuantity: 3,
};

const createdOrder = {
  id: "o1",
  reference: "S2-ORD-ABCD2345",
  status: "pending_payment",
  total: 290000,
  whatsapp_message: "Hola, quiero comprar en S2 Fit. Mi referencia de pedido es S2-ORD-ABCD2345.",
} as OrderWithMessage;

describe("CartProvider", () => {
  const wrapper = ({ children }: { children: ReactNode }) => <CartProvider>{children}</CartProvider>;

  it("suma cantidades de la misma variante sin superar las existencias", () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.add(line));
    act(() => result.current.add({ ...line, quantity: 5 }));
    expect(result.current.lines).toHaveLength(1);
    expect(result.current.count).toBe(3);
    expect(result.current.estimatedTotal).toBe(435000);
  });

  it("persiste el carrito en el navegador", () => {
    const first = renderHook(() => useCart(), { wrapper });
    act(() => first.result.current.add(line));
    first.unmount();
    const second = renderHook(() => useCart(), { wrapper });
    expect(second.result.current.lines[0].productName).toBe("Set lila");
  });
});

describe("CartPage: comprar por WhatsApp", () => {
  beforeEach(() => {
    localStorage.setItem("s2fit:cart", JSON.stringify([{ ...line, quantity: 2 }]));
    config.whatsappNumber = "573001234567";
  });
  afterEach(() => vi.restoreAllMocks());

  it("crea primero el pedido y luego redirige a WhatsApp con la referencia", async () => {
    const create = vi.spyOn(ordersApi, "create").mockResolvedValue(createdOrder);
    const redirect = vi.spyOn(navigation, "redirect").mockImplementation(() => {});
    renderWithProviders(<CartPage />, { auth: signedInAuth() });

    await userEvent.click(screen.getByRole("button", { name: "Comprar por WhatsApp" }));

    await waitFor(() => expect(redirect).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith([{ variant_id: 7, quantity: 2 }], "");
    expect(create.mock.invocationCallOrder[0]).toBeLessThan(redirect.mock.invocationCallOrder[0]);
    const url = redirect.mock.calls[0][0];
    expect(url).toMatch(/^https:\/\/wa\.me\/573001234567\?text=/);
    expect(decodeURIComponent(url)).toContain("S2-ORD-ABCD2345");
    expect(screen.getByText("S2-ORD-ABCD2345")).toBeInTheDocument();
  });

  it("si la API falla muestra el error y no abre WhatsApp", async () => {
    vi.spyOn(ordersApi, "create").mockRejectedValue(new ApiError(409, "insufficient_stock", "Solo quedan 1 unidades de Set lila (Talla M · Lila)."));
    const redirect = vi.spyOn(navigation, "redirect").mockImplementation(() => {});
    renderWithProviders(<CartPage />, { auth: signedInAuth() });

    await userEvent.click(screen.getByRole("button", { name: "Comprar por WhatsApp" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Solo quedan 1 unidades");
    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByText("Set lila")).toBeInTheDocument();
  });

  it("pide iniciar sesión antes de crear el pedido", async () => {
    const create = vi.spyOn(ordersApi, "create");
    renderWithProviders(<CartPage />, { route: "/carrito", path: "/carrito" });

    await userEvent.click(screen.getByRole("button", { name: "Comprar por WhatsApp" }));

    expect(await screen.findByText("Página de ingreso")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });
});

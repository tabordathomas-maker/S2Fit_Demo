import { config } from "../config";
import { formatCOP, resolveImage } from "./format";
import { buildWhatsAppUrl } from "./whatsapp";

vi.mock("./supabase", () => ({ getAccessToken: vi.fn(async () => "jwt-de-prueba"), supabase: null }));

describe("formatCOP", () => {
  it("usa punto como separador de miles", () => {
    expect(formatCOP(145000)).toBe("$145.000 COP");
    expect(formatCOP(1250000)).toBe("$1.250.000 COP");
    expect(formatCOP(900)).toBe("$900 COP");
  });
});

describe("resolveImage", () => {
  it("respeta URLs absolutas y antepone la ruta base a las relativas", () => {
    expect(resolveImage("https://x.supabase.co/a.png")).toBe("https://x.supabase.co/a.png");
    expect(resolveImage("products/set-lila.svg")).toBe(`${config.baseUrl}products/set-lila.svg`);
    expect(resolveImage(null)).toBeNull();
  });
});

describe("buildWhatsAppUrl", () => {
  it("codifica el mensaje y usa solo dígitos del número", () => {
    const url = buildWhatsAppUrl("Hola, mi referencia es S2-ORD-ABC12345 & más", "+57 300 123 4567");
    expect(url).toBe("https://wa.me/573001234567?text=Hola%2C%20mi%20referencia%20es%20S2-ORD-ABC12345%20%26%20m%C3%A1s");
  });

  it("devuelve null si el número no está configurado", () => {
    expect(buildWhatsAppUrl("Hola", "")).toBeNull();
  });
});

describe("apiFetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("envía el token de Supabase y el cuerpo JSON", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { apiFetch } = await import("./api");

    await apiFetch("/api/v1/orders", { method: "POST", body: { items: [] } });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${config.apiBaseUrl}/api/v1/orders`);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer jwt-de-prueba");
    expect(init.body).toBe('{"items":[]}');
  });

  it("convierte las respuestas de error en ApiError con el mensaje del backend", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: "insufficient_stock", message: "Solo quedan 1 unidades", details: {} } }), { status: 409 }),
    ));
    const { apiFetch, ApiError } = await import("./api");

    const promise = apiFetch("/api/v1/orders");

    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({ status: 409, code: "insufficient_stock", message: "Solo quedan 1 unidades" });
  });

  it("informa un error de red comprensible", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const { apiFetch } = await import("./api");
    await expect(apiFetch("/health")).rejects.toMatchObject({ code: "network_error" });
  });
});

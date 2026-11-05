import { act, render, screen } from "@testing-library/react";

import { ServerWakeNotice } from "../components/ServerWakeNotice";
import { apiFetch, ApiError } from "./api";
import { retryPolicy } from "./retryPolicy";

vi.mock("./supabase", () => ({ getAccessToken: vi.fn(async () => null), supabase: null }));

const ok = () => new Response(JSON.stringify({ ok: true }), { status: 200 });
const unavailable = () => new Response("", { status: 503 });

describe("apiFetch · reintentos y aviso de arranque en frío", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    retryPolicy.delaysMs = [2000, 5000, 10000];
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("un GET con 503, 503 y 200 se reintenta y resuelve", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(unavailable()).mockResolvedValueOnce(unavailable()).mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetchMock);

    const promise = apiFetch<{ ok: boolean }>("/api/v1/catalog/products");
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(5000);

    await expect(promise).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("también reintenta ante errores de red y se rinde tras 3 reintentos", async () => {
    const fetchMock = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    vi.stubGlobal("fetch", fetchMock);

    const promise = apiFetch("/api/v1/catalog/products");
    const assertion = expect(promise).rejects.toMatchObject({ code: "network_error" });
    await vi.advanceTimersByTimeAsync(2000 + 5000 + 10000);

    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("un POST que falla no se reintenta", async () => {
    const fetchMock = vi.fn().mockResolvedValue(unavailable());
    vi.stubGlobal("fetch", fetchMock);

    const promise = apiFetch("/api/v1/orders", { method: "POST", body: { items: [] } });

    await expect(promise).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("un error 4xx de un GET no se reintenta", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/api/v1/catalog/products/x")).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("el aviso aparece pasados 4 s y se oculta al terminar", async () => {
    let finish: (r: Response) => void = () => {};
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
    render(<ServerWakeNotice />);

    const promise = apiFetch("/api/v1/catalog/products");
    await act(async () => { await vi.advanceTimersByTimeAsync(3900); });
    expect(screen.queryByText(/Estamos despertando el servidor/)).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(screen.getByText("Estamos despertando el servidor, puede tardar hasta un minuto…")).toBeInTheDocument();

    await act(async () => { finish(ok()); await promise; });

    expect(screen.queryByText(/Estamos despertando el servidor/)).not.toBeInTheDocument();
  });

  it("si todo falla muestra un error amable con botón «Reintentar»", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(unavailable()));
    render(<ServerWakeNotice />);

    const promise = apiFetch("/api/v1/catalog/products");
    const assertion = expect(promise).rejects.toMatchObject({ status: 503 });
    await act(async () => { await vi.advanceTimersByTimeAsync(2000 + 5000 + 10000); });

    await assertion;
    expect(screen.getByText(/No pudimos conectar con el servidor/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});

import { config } from "../config";
import { clearStoredCode, getStoredCode, MI_RUTA_HEADER, notifyMiRutaAccessChanged } from "./miRutaAccess";
import { retryPolicy } from "./retryPolicy";
import { getAccessToken } from "./supabase";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestOptions {
  method?: Method;
  body?: unknown;
  query?: Record<string, string | number | undefined | null | string[]>;
  formData?: FormData;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(config.apiBaseUrl + path);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    for (const v of Array.isArray(value) ? value : [value]) url.searchParams.append(key, String(v));
  }
  return url.toString();
}

export { retryPolicy };

type WakeState = { waking: boolean; failed: boolean };
let wake: WakeState = { waking: false, failed: false };
let slowCount = 0;
const wakeListeners = new Set<() => void>();

function setWake(next: Partial<WakeState>) {
  wake = { ...wake, ...next };
  wakeListeners.forEach((listener) => listener());
}

export function subscribeWake(listener: () => void): () => void {
  wakeListeners.add(listener);
  return () => wakeListeners.delete(listener);
}

export function getWakeState(): WakeState {
  return wake;
}

/** Despierta la API (Render gratis se duerme) sin bloquear la interfaz. */
export function wakeServer(): void {
  void fetch(`${config.apiBaseUrl}/health`).catch(() => undefined);
}

function isRetryable(err: unknown): boolean {
  return err instanceof ApiError && (err.code === "network_error" || [502, 503, 504].includes(err.status));
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  // Solo las lecturas se reintentan: repetir un POST/PATCH/PUT/DELETE podría duplicar una acción.
  if ((options.method ?? "GET") !== "GET") return attempt<T>(path, options);

  let slow = false;
  const timer = setTimeout(() => {
    slow = true;
    slowCount += 1;
    setWake({ waking: true, failed: false });
  }, retryPolicy.slowAfterMs);
  try {
    for (let i = 0; ; i += 1) {
      try {
        const result = await attempt<T>(path, options);
        if (wake.failed) setWake({ failed: false });
        return result;
      } catch (err) {
        if (!isRetryable(err)) throw err;
        if (i >= retryPolicy.delaysMs.length) {
          setWake({ failed: true });
          throw err;
        }
        await sleep(retryPolicy.delaysMs[i]);
      }
    }
  } finally {
    clearTimeout(timer);
    if (slow) {
      slowCount -= 1;
      if (slowCount <= 0) setWake({ waking: false });
    }
  }
}

async function attempt<T>(path: string, options: RequestOptions): Promise<T> {
  const headers: Record<string, string> = {};
  const token = await getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const miRutaCode = getStoredCode();
  if (miRutaCode) headers[MI_RUTA_HEADER] = miRutaCode;

  let body: BodyInit | undefined;
  if (options.formData) {
    body = options.formData;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), { method: options.method ?? "GET", headers, body });
  } catch {
    throw new ApiError(0, "network_error", "No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.");
  }

  if (!response.ok) {
    let code = "http_error";
    let message = "Ocurrió un error inesperado. Intenta de nuevo.";
    let details: Record<string, unknown> = {};
    try {
      const data = await response.json();
      code = data?.error?.code ?? code;
      message = data?.error?.message ?? message;
      details = data?.error?.details ?? {};
    } catch {
      // Respuesta sin JSON (por ejemplo, el servidor está despertando en Render).
    }
    if (code === "mi_ruta_locked") {
      // El código guardado ya no vale (o se quitó el acceso): se olvida y la página vuelve a pedirlo.
      if (miRutaCode) clearStoredCode();
      else notifyMiRutaAccessChanged();
    }
    throw new ApiError(response.status, code, message, details);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Ocurrió un error inesperado. Intenta de nuevo.";
}

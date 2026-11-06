import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../../services/api";
import { clearStoredCode, getStoredCode, subscribeMiRutaAccess } from "../../services/miRutaAccess";
import { useAuth } from "../auth/AuthProvider";
import { miRutaApi } from "./api";

// Un canje por cuenta y código, aunque lo pidan el menú y la página a la vez.
const redeemed = new Map<string, Promise<void>>();

export function resetAutoRedeem(): void {
  redeemed.clear();
}

function autoRedeem(userId: string, code: string): Promise<void> {
  const key = `${userId}:${code}`;
  let attempt = redeemed.get(key);
  if (!attempt) {
    attempt = miRutaApi
      .redeem(code)
      .then(() => undefined)
      .catch((err) => {
        // Un código que ya no vale se olvida; si es de otra cuenta se deja: sigue sirviendo sin cuenta.
        if (err instanceof ApiError && err.code === "invalid_code") clearStoredCode();
      });
    redeemed.set(key, attempt);
  }
  return attempt;
}

interface AccessState {
  loading: boolean;
  hasAccess: boolean;
  source: string | null;
}

/** ¿Tiene acceso a Mi Ruta? Se recarga al iniciar sesión, al guardar un código o si el backend responde mi_ruta_locked. */
export function useMiRutaAccess(): AccessState & { reload: () => void } {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<AccessState>({ loading: true, hasAccess: false, source: null });

  useEffect(() => subscribeMiRutaAccess(() => setVersion((v) => v + 1)), []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const code = getStoredCode();
      if (userId && code) await autoRedeem(userId, code);
      try {
        const result = await miRutaApi.access();
        if (active) setState({ loading: false, hasAccess: Boolean(result.has_access), source: result.source ?? null });
      } catch {
        if (active) setState({ loading: false, hasAccess: false, source: null });
      }
    })();
    return () => {
      active = false;
    };
  }, [userId, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}

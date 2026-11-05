import { useCallback, useState } from "react";

import { errorMessage } from "../../services/api";
import { Alert } from "../ui";

/** Aviso de éxito o error visible tras cada acción del panel. */
export function useNotice() {
  const [state, setState] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const success = useCallback((text: string) => setState({ tone: "success", text }), []);
  const fail = useCallback((err: unknown) => setState({ tone: "error", text: errorMessage(err) }), []);
  const clear = useCallback(() => setState(null), []);
  const notice = state ? <Alert tone={state.tone}>{state.text}</Alert> : null;
  return { notice, success, fail, clear };
}

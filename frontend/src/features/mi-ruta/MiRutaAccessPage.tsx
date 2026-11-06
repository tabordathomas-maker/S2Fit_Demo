import { useEffect, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";

import { Spinner } from "../../components/ui";
import { errorMessage } from "../../services/api";
import { normalizeCode, storeCode } from "../../services/miRutaAccess";
import { miRutaApi } from "./api";
import { MiRutaGate } from "./MiRutaGate";

/** /mi-ruta/acceso/:code (el enlace del QR): valida el código, lo guarda y abre Mi Ruta. */
export function MiRutaAccessPage() {
  const { code = "" } = useParams();
  const [state, setState] = useState<"checking" | "ok" | { error: string }>("checking");
  const started = useRef(false);

  useEffect(() => {
    // Una sola verificación por visita: cada una suma un uso del código.
    if (started.current) return;
    started.current = true;
    const normalized = normalizeCode(code);
    miRutaApi
      .verify(normalized)
      .then(() => {
        storeCode(normalized);
        setState("ok");
      })
      .catch((err) => setState({ error: errorMessage(err) }));
  }, [code]);

  if (state === "ok") return <Navigate to="/mi-ruta" replace />;
  if (state === "checking") {
    return (
      <section className="py-[72px]">
        <div className="wrap"><Spinner label="Verificando tu código…" /></div>
      </section>
    );
  }
  return <MiRutaGate initialError={state.error} />;
}

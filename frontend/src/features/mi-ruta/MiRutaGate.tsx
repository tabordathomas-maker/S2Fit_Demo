import { useState, type FormEvent } from "react";

import { Alert, Button, Field, LinkButton, SectionTitle } from "../../components/ui";
import { errorMessage } from "../../services/api";
import { normalizeCode, storeCode } from "../../services/miRutaAccess";
import { miRutaApi } from "./api";

/** Pantalla para quien aún no tiene acceso: pide el código que llega con la compra. */
export function MiRutaGate({ initialError = null }: { initialError?: string | null }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const normalized = normalizeCode(code);
    if (!normalized) {
      setError("Escribe tu código.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await miRutaApi.verify(normalized);
      storeCode(normalized);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <section className="py-[72px]">
      <div className="wrap flex max-w-xl flex-col gap-6">
        <SectionTitle eyebrow="MI RUTA" title="Mi Ruta es para clientas S2">
          Al comprar una prenda recibes un código o un QR para entrar a rutinas, recetas, retos y crecimiento personal.
        </SectionTitle>
        <form onSubmit={submit} className="card flex flex-col gap-4 p-6 sm:p-9" noValidate>
          <Field
            label="Ingresa tu código"
            id="mi-ruta-code"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="K7M-2QX"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          {error && <Alert>{error}</Alert>}
          <Button type="submit" variant="dark" disabled={busy}>{busy ? "Verificando…" : "Entrar"}</Button>
        </form>
        <div className="flex flex-wrap gap-3">
          <LinkButton to="/tienda" variant="dark">Ir a la Tienda</LinkButton>
          <LinkButton to="/ingresar?next=/mi-ruta">Ingresar</LinkButton>
        </div>
      </div>
    </section>
  );
}

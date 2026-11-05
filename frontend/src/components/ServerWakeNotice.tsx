import { useSyncExternalStore } from "react";

import { getWakeState, subscribeWake } from "../services/api";

/** Aviso no intrusivo mientras la API despierta, y botón para reintentar si no respondió. */
export function ServerWakeNotice() {
  const { waking, failed } = useSyncExternalStore(subscribeWake, getWakeState);
  if (failed) {
    return (
      <div role="alert" className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-3 text-red-900 shadow-lg">
        <span>No pudimos conectar con el servidor. Intenta de nuevo en unos segundos.</span>
        <button type="button" onClick={() => window.location.reload()} className="inline-flex min-h-11 items-center rounded-full border-2 border-burgundy bg-burgundy px-5 font-bold text-cream">
          Reintentar
        </button>
      </div>
    );
  }
  if (!waking) return null;
  return (
    <div role="status" className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-md rounded-2xl border-2 border-beige bg-white px-4 py-3 shadow-lg">
      Estamos despertando el servidor, puede tardar hasta un minuto…
    </div>
  );
}

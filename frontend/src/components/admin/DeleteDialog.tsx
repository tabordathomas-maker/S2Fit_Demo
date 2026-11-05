import { useEffect, useState } from "react";

import { ApiError, errorMessage } from "../../services/api";
import { Alert, Button } from "../ui";
import { ConfirmDialog } from "./ConfirmDialog";
import { hasHistory, historyText, isInUse, liveText, type Usage } from "./usage";

interface DeleteDialogProps {
  /** Elemento que se quiere eliminar (null = cerrado). */
  target: { name: string } | null;
  /** Tipo de elemento en minúsculas, para el título («producto»). */
  noun: string;
  remove: () => Promise<unknown>;
  /** Alternativa cuando está en uso. Sin ella no se ofrece el botón. */
  archive?: () => Promise<unknown>;
  /** Uso vigente e histórico que devuelve el listado del panel. Con algo vigente no se llama a DELETE. */
  usage?: Usage | null;
  onClose: () => void;
  /** Se llama tras eliminar o archivar, para refrescar la lista y mostrar el aviso. */
  onDone: (outcome: "deleted" | "archived") => void;
}

/**
 * Confirma y elimina. Con algo vigente abre directo en «No se puede eliminar» (sin llamar a DELETE); con solo historial
 * avisa que se conserva; y si el backend responde 409 RESOURCE_IN_USE muestra su mensaje y ofrece archivar.
 */
export function DeleteDialog({ target, noun, remove, archive, usage, onClose, onDone }: DeleteDialogProps) {
  const [busy, setBusy] = useState(false);
  const [inUse, setInUse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setInUse(null);
    setError(null);
    setBusy(false);
  }, [target]);

  const blocked = isInUse(usage);
  const blockedByServer = inUse !== null;
  const stopped = blocked || blockedByServer;

  const attempt = async (action: () => Promise<unknown>, outcome: "deleted" | "archived") => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onDone(outcome);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === "RESOURCE_IN_USE") setInUse(err.message);
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  let body;
  if (blockedByServer) body = <Alert tone="info">{inUse}</Alert>;
  else if (blocked && usage) body = <Alert tone="info">Este {noun} tiene {liveText(usage)}. Puedes archivarlo para que deje de ofrecerse.</Alert>;
  else if (hasHistory(usage) && usage) {
    body = <p>Se quitará del panel y de la página. El historial ({historyText(usage)}) se conserva.</p>;
  } else body = <p>¿Seguro que quieres eliminar «{target?.name}»? Esta acción no se puede deshacer.</p>;

  return (
    <ConfirmDialog
      open={target !== null}
      title={stopped ? "No se puede eliminar" : `Eliminar ${noun}`}
      confirmLabel="Eliminar"
      busy={busy}
      hideConfirm={stopped}
      extra={stopped && archive && (
        <Button variant="dark" className="w-full sm:w-auto" disabled={busy} onClick={() => void attempt(archive, "archived")}>
          {blockedByServer ? "Archivar en su lugar" : "Archivar"}
        </Button>
      )}
      message={
        <div className="flex flex-col gap-3">
          {body}
          {error && <Alert>{error}</Alert>}
        </div>
      }
      onConfirm={() => void attempt(remove, "deleted")}
      onCancel={onClose}
    />
  );
}

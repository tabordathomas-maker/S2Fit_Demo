import { useEffect, useState } from "react";

import { ApiError, errorMessage } from "../../services/api";
import { Alert, Button } from "../ui";
import { ConfirmDialog } from "./ConfirmDialog";

interface DeleteDialogProps {
  /** Elemento que se quiere eliminar (null = cerrado). */
  target: { name: string } | null;
  /** Tipo de elemento en minúsculas, para el título («producto»). */
  noun: string;
  remove: () => Promise<unknown>;
  /** Alternativa cuando el backend responde 409 RESOURCE_IN_USE. Sin ella no se ofrece el botón. */
  archive?: () => Promise<unknown>;
  onClose: () => void;
  /** Se llama tras eliminar o archivar, para refrescar la lista y mostrar el aviso. */
  onDone: (outcome: "deleted" | "archived") => void;
}

/** Confirma y elimina. Si el backend dice que está en uso, muestra su mensaje y ofrece «Archivar en su lugar». */
export function DeleteDialog({ target, noun, remove, archive, onClose, onDone }: DeleteDialogProps) {
  const [busy, setBusy] = useState(false);
  const [inUse, setInUse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setInUse(null);
    setError(null);
    setBusy(false);
  }, [target]);

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

  return (
    <ConfirmDialog
      open={target !== null}
      title={`Eliminar ${noun}`}
      confirmLabel="Eliminar"
      busy={busy}
      hideConfirm={inUse !== null}
      extra={inUse !== null && archive && (
        <Button variant="dark" disabled={busy} onClick={() => void attempt(archive, "archived")}>Archivar en su lugar</Button>
      )}
      message={
        <div className="flex flex-col gap-3">
          {inUse === null
            ? <p>¿Seguro que quieres eliminar «{target?.name}»? Esta acción no se puede deshacer.</p>
            : <Alert tone="info">{inUse}</Alert>}
          {error && <Alert>{error}</Alert>}
        </div>
      }
      onConfirm={() => void attempt(remove, "deleted")}
      onCancel={onClose}
    />
  );
}

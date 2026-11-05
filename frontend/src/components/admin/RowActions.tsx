import { Button } from "../ui";

function Icon({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

const PATHS = {
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z",
  archive: "M3 4h18v4H3zM5 8v12h14V8M10 12h4",
  restore: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
  remove: "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5",
};

interface RowActionsProps {
  /** Nombre del elemento, para los aria-label («Editar Camiseta»). */
  name: string;
  archived?: boolean;
  onEdit?: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
  onDelete?: () => void;
  disabled?: boolean;
}

/** Botones Editar, Archivar/Restaurar y Eliminar con ícono y texto. Los que no tienen acción no se muestran. */
export function RowActions({ name, archived = false, onEdit, onArchive, onRestore, onDelete, disabled }: RowActionsProps) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={`Acciones de ${name}`}>
      {onEdit && (
        <Button aria-label={`Editar ${name}`} disabled={disabled} onClick={onEdit}><Icon d={PATHS.edit} />Editar</Button>
      )}
      {archived
        ? onRestore && <Button aria-label={`Restaurar ${name}`} disabled={disabled} onClick={onRestore}><Icon d={PATHS.restore} />Restaurar</Button>
        : onArchive && <Button aria-label={`Archivar ${name}`} disabled={disabled} onClick={onArchive}><Icon d={PATHS.archive} />Archivar</Button>}
      {onDelete && (
        <Button aria-label={`Eliminar ${name}`} disabled={disabled} onClick={onDelete}><Icon d={PATHS.remove} />Eliminar</Button>
      )}
    </div>
  );
}

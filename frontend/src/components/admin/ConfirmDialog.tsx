import { useEffect, useId, useRef, type ReactNode } from "react";

import { Button } from "../ui";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  /** Acciones extra entre «Cancelar» y el botón destructivo (por ejemplo «Archivar en su lugar»). */
  extra?: ReactNode;
  /** Oculta el botón de confirmar (cuando solo queda la alternativa de archivar). */
  hideConfirm?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Modal accesible: foco atrapado, Esc cierra y el botón destructivo va en borgoña. */
export function ConfirmDialog({
  open, title, message, confirmLabel, cancelLabel = "Cancelar", busy = false, extra, hideConfirm = false, onConfirm, onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const messageId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCancelRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.current.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={messageId} className="card flex w-[calc(100%-2rem)] max-w-md flex-col gap-4 bg-white p-6">
        <h2 id={titleId} className="text-2xl">{title}</h2>
        <div id={messageId} className="text-ink">{message}</div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <button ref={cancelRef} type="button" className="inline-flex min-h-11 w-full items-center justify-center rounded-full border-2 border-ink px-6 py-2.5 font-bold hover:bg-ink hover:text-cream sm:w-auto" onClick={onCancel}>
            {cancelLabel}
          </button>
          {extra}
          {!hideConfirm && (
            <Button variant="dark" className="w-full sm:w-auto" disabled={busy} onClick={onConfirm}>{confirmLabel}</Button>
          )}
        </div>
      </div>
    </div>
  );
}

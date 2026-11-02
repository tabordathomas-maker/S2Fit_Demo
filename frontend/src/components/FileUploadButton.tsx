import type { ChangeEvent } from "react";

import { buttonClasses } from "./ui";

export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
export const IMAGE_HINT = "JPG, PNG o WEBP, máximo 5 MB. Mejor vertical (por ejemplo 1200 × 1500).";

/** Botón grande para elegir un archivo desde el computador o el celular. */
export function FileUploadButton({ id, label, accept, busy = false, busyLabel = "Subiendo…", hint, onFile }: {
  id: string;
  label: string;
  accept: string;
  busy?: boolean;
  busyLabel?: string;
  hint?: string;
  onFile: (file: File) => void;
}) {
  const change = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onFile(file);
  };
  return (
    <div className="flex flex-col gap-1">
      <input id={id} type="file" accept={accept} disabled={busy} onChange={change} className="peer sr-only" />
      <label
        htmlFor={id}
        aria-disabled={busy}
        className={`${buttonClasses("dark", "cursor-pointer self-start peer-focus-visible:ring-2 peer-focus-visible:ring-burgundy peer-focus-visible:ring-offset-2")} ${busy ? "pointer-events-none opacity-50" : ""}`}
      >
        {busy ? busyLabel : label}
      </label>
      {hint && <p className="text-sm text-muted">{hint}</p>}
    </div>
  );
}

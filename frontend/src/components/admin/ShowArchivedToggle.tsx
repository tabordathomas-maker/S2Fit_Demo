interface ShowArchivedToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: string;
}

/** Interruptor «Mostrar archivados» para las listas del panel. */
export function ShowArchivedToggle({ checked, onChange, label = "Mostrar archivados" }: ShowArchivedToggleProps) {
  return (
    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 font-bold">
      <input type="checkbox" role="switch" className="h-5 w-5 accent-burgundy" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

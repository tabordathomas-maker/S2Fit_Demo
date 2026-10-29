import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { Link, type LinkProps } from "react-router-dom";

type Variant = "outline" | "dark" | "light";

const variants: Record<Variant, string> = {
  outline: "border-ink bg-transparent text-ink hover:bg-ink hover:text-cream",
  dark: "border-burgundy bg-burgundy text-cream hover:bg-burgundy-dark hover:border-burgundy-dark",
  light: "border-beige bg-beige text-ink hover:bg-white hover:border-white",
};

export function buttonClasses(variant: Variant = "outline", extra = ""): string {
  return `inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 px-6 py-2.5 text-base font-bold transition-colors disabled:opacity-50 ${variants[variant]} ${extra}`;
}

export function Button({ variant = "outline", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" className={buttonClasses(variant, className)} {...props} />;
}

export function LinkButton({ variant = "outline", className = "", ...props }: LinkProps & { variant?: Variant }) {
  return <Link className={buttonClasses(variant, className)} {...props} />;
}

/** Botón tipo píldora para pestañas y selectores (activo = borgoña). */
export function Pill({ active, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`min-h-11 rounded-full border-2 px-5 py-2 text-base font-bold transition-colors ${
        active ? "border-burgundy bg-burgundy text-cream" : "border-beige bg-transparent text-ink hover:border-burgundy"
      } ${className}`}
      {...props}
    />
  );
}

export function Badge({ children, tone = "beige" }: { children: ReactNode; tone?: "beige" | "burgundy" | "green" | "red" | "gray" }) {
  const tones = {
    beige: "bg-beige text-burgundy",
    burgundy: "bg-burgundy text-cream",
    green: "bg-emerald-100 text-emerald-900",
    red: "bg-red-100 text-red-900",
    gray: "bg-neutral-200 text-neutral-800",
  };
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-bold ${tones[tone]}`}>{children}</span>;
}

export function ProgressBar({ percent, label }: { percent: number; label: string }) {
  const value = Math.max(0, Math.min(100, percent));
  return (
    <div className="h-3.5 overflow-hidden rounded-full bg-beige" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full bg-burgundy transition-all" style={{ width: `${value}%` }} />
    </div>
  );
}

export function Alert({ tone = "error", children }: { tone?: "error" | "success" | "info"; children: ReactNode }) {
  const tones = {
    error: "border-red-300 bg-red-50 text-red-900",
    success: "border-emerald-300 bg-emerald-50 text-emerald-900",
    info: "border-beige bg-white text-ink",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-2xl border-2 px-4 py-3 ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function Spinner({ label = "Cargando…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-6 text-muted" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-beige border-t-burgundy" aria-hidden />
      {label}
    </div>
  );
}

export function Field({ label, id, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string; hint?: string }) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <input id={id} className="input" {...props} />
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  );
}

export function TextArea({ label, id, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; id: string }) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <textarea id={id} className="input min-h-24" {...props} />
    </div>
  );
}

export function Select({ label, id, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; id: string }) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <select id={id} className="input" {...props}>{children}</select>
    </div>
  );
}

export function SectionTitle({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      {eyebrow && <span className="font-bold text-burgundy">{eyebrow}</span>}
      <h1 className="text-[clamp(30px,4vw,44px)] leading-tight">{title}</h1>
      {children && <p className="muted text-lg">{children}</p>}
    </div>
  );
}

export function PlayIcon() {
  return (
    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-burgundy" aria-hidden>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="#F5F4EF"><path d="M6 3l11 7-11 7z" /></svg>
    </span>
  );
}

export function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

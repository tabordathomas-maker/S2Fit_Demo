import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";

import { Alert, Button, Field } from "../../components/ui";
import { useAuth } from "./AuthProvider";

function safeNext(value: string | null): string {
  // Solo rutas internas: evita redirecciones abiertas a otros sitios.
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/cuenta";
}

function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  const { configured } = useAuth();
  return (
    <section className="py-[72px]">
      <div className="wrap max-w-md">
        <div className="card flex flex-col gap-5">
          <h1 className="text-3xl">{title}</h1>
          {!configured && (
            <Alert>La autenticación no está configurada. Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.</Alert>
          )}
          {children}
        </div>
      </div>
    </section>
  );
}

function useSubmit() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos completar la operación.");
    } finally {
      setBusy(false);
    }
  };
  return { error, busy, run };
}

export function LoginPage() {
  const { signIn, session } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { error, busy, run } = useSubmit();

  if (session) return <Navigate to={next} replace />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await signIn(email.trim(), password);
      navigate(next, { replace: true });
    });
  };

  return (
    <AuthCard title="Ingresar">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Correo" id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label="Contraseña" id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" variant="dark" disabled={busy}>{busy ? "Ingresando…" : "Ingresar"}</Button>
      </form>
      <div className="flex flex-col gap-2 text-sm">
        <Link to={`/registro?next=${encodeURIComponent(next)}`} className="font-bold text-burgundy">¿No tienes cuenta? Regístrate</Link>
        <Link to="/recuperar-contrasena" className="text-muted underline">Olvidé mi contraseña</Link>
      </div>
    </AuthCard>
  );
}

export function RegisterPage() {
  const { signUp, session } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get("next"));
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", password: "", accept: false });
  const [done, setDone] = useState(false);
  const { error, busy, run } = useSubmit();

  if (session && !done) return <Navigate to={next} replace />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (form.password.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");
      const { needsConfirmation } = await signUp(form.email.trim(), form.password, form.fullName.trim(), form.phone.trim());
      if (needsConfirmation) setDone(true);
      else navigate(next, { replace: true });
    });
  };

  if (done) {
    return (
      <AuthCard title="Revisa tu correo">
        <Alert tone="success">Te enviamos un enlace para confirmar tu cuenta. Después podrás ingresar.</Alert>
        <Link to="/ingresar" className="font-bold text-burgundy">Ir a ingresar</Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Crear cuenta">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nombre completo" id="fullName" autoComplete="name" required minLength={2} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
        <Field label="Celular (WhatsApp)" id="phone" type="tel" autoComplete="tel" pattern="\+?[0-9]{7,15}" placeholder="+57…" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <Field label="Correo" id="email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Field label="Contraseña" id="password" type="password" autoComplete="new-password" required minLength={8} hint="Mínimo 8 caracteres." value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" required checked={form.accept} onChange={(e) => setForm({ ...form, accept: e.target.checked })} className="mt-1 h-4 w-4 accent-burgundy" />
          <span>Autorizo el tratamiento de mis datos personales según la <Link to="/privacidad" className="underline">política de tratamiento de datos</Link>.</span>
        </label>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" variant="dark" disabled={busy}>{busy ? "Creando cuenta…" : "Crear cuenta"}</Button>
      </form>
      <Link to={`/ingresar?next=${encodeURIComponent(next)}`} className="text-sm font-bold text-burgundy">¿Ya tienes cuenta? Ingresa</Link>
    </AuthCard>
  );
}

export function ForgotPasswordPage() {
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const { error, busy, run } = useSubmit();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await sendPasswordReset(email.trim());
      setSent(true);
    });
  };

  return (
    <AuthCard title="Recuperar contraseña">
      {sent ? (
        <Alert tone="success">Si el correo está registrado, recibirás un enlace para crear una nueva contraseña.</Alert>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Correo" id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          {error && <Alert>{error}</Alert>}
          <Button type="submit" variant="dark" disabled={busy}>Enviar enlace</Button>
        </form>
      )}
    </AuthCard>
  );
}

export function ResetPasswordPage() {
  const { updatePassword, session, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const { error, busy, run } = useSubmit();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (password.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");
      await updatePassword(password);
      navigate("/cuenta", { replace: true });
    });
  };

  return (
    <AuthCard title="Nueva contraseña">
      {!loading && !session ? (
        <Alert>El enlace no es válido o ya expiró. Solicita uno nuevo desde «Olvidé mi contraseña».</Alert>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Nueva contraseña" id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <Alert>{error}</Alert>}
          <Button type="submit" variant="dark" disabled={busy}>Guardar contraseña</Button>
        </form>
      )}
    </AuthCard>
  );
}

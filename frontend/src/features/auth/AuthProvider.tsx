import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { apiFetch } from "../../services/api";
import { supabase } from "../../services/supabase";
import type { Profile } from "../../services/types";

export interface AuthContextValue {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string, phone: string) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

function authRedirectUrl(hashPath: string): string {
  return `${window.location.origin}${window.location.pathname}#${hashPath}`;
}

function translateAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return "Correo o contraseña incorrectos.";
  if (/email not confirmed/i.test(message)) return "Confirma tu correo antes de iniciar sesión.";
  if (/already registered/i.test(message)) return "Ya existe una cuenta con ese correo.";
  if (/password/i.test(message) && /characters/i.test(message)) return "La contraseña debe tener al menos 8 caracteres.";
  if (/rate limit/i.test(message)) return "Demasiados intentos. Espera unos minutos.";
  return "No pudimos completar la operación. Intenta de nuevo.";
}

function requireClient() {
  if (!supabase) throw new Error("La autenticación no está configurada (faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY).");
  return supabase;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  const loadProfile = useCallback(async (current: Session | null) => {
    if (!current) {
      setProfile(null);
      return;
    }
    try {
      setProfile(await apiFetch<Profile>("/api/v1/me"));
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      // Se difiere para no llamar a Supabase dentro de su propio callback.
      setTimeout(() => void loadProfile(next), 0);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: Boolean(supabase),
      loading,
      session,
      profile,
      isAdmin: profile?.role === "admin",
      async signIn(email, password) {
        const { error } = await requireClient().auth.signInWithPassword({ email, password });
        if (error) throw new Error(translateAuthError(error.message));
      },
      async signUp(email, password, fullName, phone) {
        // Los metadatos solo llevan nombre y teléfono: el rol lo decide el backend.
        const { data, error } = await requireClient().auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName, phone }, emailRedirectTo: authRedirectUrl("/ingresar") },
        });
        if (error) throw new Error(translateAuthError(error.message));
        return { needsConfirmation: !data.session };
      },
      async signOut() {
        await requireClient().auth.signOut();
        setProfile(null);
      },
      async sendPasswordReset(email) {
        const { error } = await requireClient().auth.resetPasswordForEmail(email, {
          redirectTo: authRedirectUrl("/restablecer-contrasena"),
        });
        if (error) throw new Error(translateAuthError(error.message));
      },
      async updatePassword(password) {
        const { error } = await requireClient().auth.updateUser({ password });
        if (error) throw new Error(translateAuthError(error.message));
      },
      refreshProfile: () => loadProfile(session),
    }),
    [loading, session, profile, loadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}

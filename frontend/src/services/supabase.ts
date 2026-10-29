import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { config } from "../config";

// Solo se usan la URL del proyecto y la clave pública (anon/publishable).
// La clave service_role vive exclusivamente en el backend.
export const supabase: SupabaseClient | null =
  config.supabaseUrl && config.supabaseAnonKey
    ? createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
      })
    : null;

export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

// Las variables VITE_* se incrustan en el bundle público: nunca deben contener secretos.
export const config = {
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/+$/, ""),
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? "",
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
  whatsappNumber: (import.meta.env.VITE_WHATSAPP_BUSINESS_NUMBER ?? "").replace(/\D/g, ""),
  baseUrl: import.meta.env.BASE_URL,
};

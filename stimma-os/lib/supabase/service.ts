import { createClient } from "@supabase/supabase-js";

/**
 * Cliente com a chave service_role. Usar SOMENTE em Route Handlers/Server
 * Actions de confiança (sync, automações, aprovações) — nunca em componente
 * de cliente, nunca retornado ao navegador. Ver docs/SECURITY.md.
 */
export function createSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY ou NEXT_PUBLIC_SUPABASE_URL não configuradas."
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** true quando ha um projeto Supabase configurado (fora do modo demonstracao). */
export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

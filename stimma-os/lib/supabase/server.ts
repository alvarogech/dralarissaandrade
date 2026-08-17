import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Cliente Supabase autenticado como o usuario da sessao (cookies), usado em
 * Server Components / Server Actions do cockpit. Respeita RLS — so enxerga o
 * que a policy permitir para o usuario logado (ver current_profile_org() nas
 * migrations).
 */
export function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const cookieStore = cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // chamado a partir de um Server Component sem permissao de escrita;
          // o middleware cuida do refresh de sessao nesses casos.
        }
      },
      remove(name: string, options) {
        try {
          cookieStore.set({ name, value: "", ...options });
        } catch {
          // ver comentario acima
        }
      },
    },
  });
}

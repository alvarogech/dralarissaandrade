import type { User } from "@supabase/supabase-js";

export interface StaffProfile {
  active: boolean;
}

/**
 * Autorizacao para acessar o cockpit: precisa de usuario autenticado E
 * perfil ativo (mesma barreira do anamnese-app — ver docs/SECURITY.md).
 * Em modo demonstracao (sem Supabase configurado), o middleware nao chama
 * esta funcao — a rota fica aberta com aviso visivel de "modo demonstracao".
 */
export function isAuthorized(user: User | null, profile: StaffProfile | null): boolean {
  if (!user) return false;
  if (!profile) return false;
  return profile.active;
}

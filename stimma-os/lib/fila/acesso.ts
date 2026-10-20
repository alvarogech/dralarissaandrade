import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { isAuthorized } from "@/lib/auth-guard";
import { storeDemo } from "./store-memoria";
import { criarStoreSupabase } from "./store-supabase";
import { ErroRegra, type Ator } from "./servico";
import type { FilaStore } from "./store";

/**
 * Quem está agindo e com qual store. Sessão + perfil ativo (mesma barreira do middleware);
 * gestão = papel `admin` em user_roles. Sem Supabase configurado → modo demonstração em memória
 * (ator fictício com papel de gestão), nunca o banco real.
 */
export interface Contexto {
  ator: Ator;
  store: FilaStore;
  demo: boolean;
}

export async function contextoDaSessao(): Promise<Contexto | null> {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { ator: { id: "00000000-0000-4000-8000-000000000000", email: "demo@stimma.local", gestao: true }, store: storeDemo().store, demo: true };
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const service = createSupabaseServiceClient();
  const { data: profile } = await service.from("profiles").select("active, organization_id").eq("id", user.id).maybeSingle();
  if (!isAuthorized(user, profile) || !profile?.organization_id) return null;
  const { data: papeis } = await service.from("user_roles").select("roles(key)").eq("user_id", user.id);
  const gestao = (papeis ?? []).some((r: { roles: unknown }) => {
    const roles = Array.isArray(r.roles) ? r.roles : [r.roles];
    return roles.some((x) => (x as { key?: string } | null)?.key === "admin");
  });
  return { ator: { id: user.id, email: user.email ?? user.id, gestao }, store: criarStoreSupabase(service, profile.organization_id), demo: false };
}

/** Envelope comum dos Route Handlers da fila. */
export async function rotaFila(fn: (ctx: Contexto) => Promise<unknown>) {
  const ctx = await contextoDaSessao();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await fn(ctx));
  } catch (e) {
    if (e instanceof ErroRegra) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[fila]", e);
    return NextResponse.json({ error: "Erro inesperado. Recarregue a página e confira o que entrou antes de tentar de novo." }, { status: 500 });
  }
}

import { NextRequest } from "next/server";
import { rotaFila } from "@/lib/fila/acesso";
import { sincronizarAgendaColada } from "@/lib/fila/agenda-sincronizar";
import { ErroRegra } from "@/lib/fila/servico";

// Sempre por requisição: depende da sessão (cookies) e nunca pode ser servida de cache.
export const dynamic = "force-dynamic";

/**
 * Botão "Sincronizar agenda": recebe o texto copiado pelo favorito na agenda do Simples Dental e
 * grava pelo motor idempotente de sync, com a autoria do usuário logado (gestão ou concierge).
 * Sem sessão = 401. Nada é escrito no Simples Dental.
 */
export async function POST(request: NextRequest) {
  return rotaFila(async ({ ator, store }) => {
    const { texto } = (await request.json()) as { texto?: string };
    if (typeof texto !== "string" || !texto.trim()) throw new ErroRegra("Cole o texto copiado da agenda do Simples Dental.");
    if (texto.length > 200_000) throw new ErroRegra("Texto grande demais.");
    return sincronizarAgendaColada(store, ator, texto);
  });
}

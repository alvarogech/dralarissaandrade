import { NextRequest } from "next/server";
import { rotaFila } from "@/lib/fila/acesso";
import { hojeSaoPaulo } from "@/lib/fila/datas";
import { salvarEstadoDoDia } from "@/lib/fila/servico";
import { resolverPrioridade, salvarRascunho } from "@/lib/fila/prioridades";
import type { EstadoDoDia, RascunhoFechamento } from "@/lib/fila/store";

// Sempre por requisição: depende da sessão (cookies) e nunca pode ser servida de cache.
export const dynamic = "force-dynamic";

/**
 * Estado do dia: prioridades para o próximo dia útil, seções "sem ocorrências", rascunho do
 * fechamento (`rascunho`) e prioridade herdada resolvida (`resolver`).
 */
export async function POST(request: NextRequest) {
  return rotaFila(async ({ ator, store }) => {
    const b = (await request.json()) as { dia?: string; rascunho?: RascunhoFechamento; resolver?: { dia: string; indice: number; desfazer?: boolean } } & Partial<EstadoDoDia>;
    if (b.resolver) { await resolverPrioridade(store, ator, b.resolver); return { ok: true }; }
    if (b.rascunho) return { rascunho: await salvarRascunho(store, ator, b.rascunho) };
    await salvarEstadoDoDia(store, ator, b.dia ?? hojeSaoPaulo(), { prioridades: b.prioridades, secoes: b.secoes });
    return { ok: true };
  });
}

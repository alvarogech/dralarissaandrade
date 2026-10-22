import { NextRequest } from "next/server";
import { rotaFila } from "@/lib/fila/acesso";
import { aplicarContinuidade, ErroRegra } from "@/lib/fila/servico";

// Sempre por requisição: depende da sessão (cookies) e nunca pode ser servida de cache.
export const dynamic = "force-dynamic";

/** Aplica uma proposta de continuidade aprovada pela gestão (tarefa existente). */
export async function POST(request: NextRequest) {
  return rotaFila(async ({ ator, store }) => {
    const b = (await request.json()) as { tarefaId?: string; tipo?: string; novaData?: string | null; proximaAcao?: string | null; motivo?: string; diaFeedback?: string };
    if (!b.tarefaId || (b.tipo !== "atualizar_tarefa" && b.tipo !== "encerrar_tarefa") || !b.diaFeedback) throw new ErroRegra("Proposta incompleta.");
    await aplicarContinuidade(store, ator, { tarefaId: b.tarefaId, tipo: b.tipo, novaData: b.novaData ?? null, proximaAcao: b.proximaAcao ?? null, motivo: b.motivo ?? "", diaFeedback: b.diaFeedback });
    return { ok: true };
  });
}

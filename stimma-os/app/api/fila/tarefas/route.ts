import { NextRequest } from "next/server";
import { rotaFila } from "@/lib/fila/acesso";
import { criarTarefaManual, ErroRegra, listarTarefasGestao, type NovaTarefa } from "@/lib/fila/servico";

// Sempre por requisição: depende da sessão (cookies) e nunca pode ser servida de cache.
export const dynamic = "force-dynamic";

/** Lista (gestão) e criação manual de tarefas. */
export async function GET() {
  return rotaFila(async ({ ator, store }) => {
    if (!ator.gestao) throw new ErroRegra("Só a gestão vê a lista completa.", 403);
    return listarTarefasGestao(store);
  });
}

export async function POST(request: NextRequest) {
  return rotaFila(async ({ ator, store }) => ({ id: await criarTarefaManual(store, ator, (await request.json()) as NovaTarefa) }));
}

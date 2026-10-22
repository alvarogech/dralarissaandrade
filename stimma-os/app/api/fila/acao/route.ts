import { NextRequest } from "next/server";
import { rotaFila } from "@/lib/fila/acesso";
import { registrarAcao, type EntradaAcao } from "@/lib/fila/servico";

// Sempre por requisição: depende da sessão (cookies) e nunca pode ser servida de cache.
export const dynamic = "force-dynamic";

/** Registra uma ação da concierge (contato, resposta, adiamento, agendamento, recebimento, encerramento). */
export async function POST(request: NextRequest) {
  return rotaFila(async ({ ator, store }) => registrarAcao(store, ator, (await request.json()) as EntradaAcao));
}

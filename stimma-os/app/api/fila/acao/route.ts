import { NextRequest } from "next/server";
import { rotaFila } from "@/lib/fila/acesso";
import { registrarAcao, type EntradaAcao } from "@/lib/fila/servico";

/** Registra uma ação da concierge (contato, resposta, adiamento, agendamento, recebimento, encerramento). */
export async function POST(request: NextRequest) {
  return rotaFila(async ({ ator, store }) => registrarAcao(store, ator, (await request.json()) as EntradaAcao));
}

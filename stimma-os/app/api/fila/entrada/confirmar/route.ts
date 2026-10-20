import { NextRequest } from "next/server";
import { rotaFila } from "@/lib/fila/acesso";
import { confirmarEntrada, ErroRegra, type Resolucao } from "@/lib/fila/servico";

/**
 * Confirma a entrada: a prévia é recalculada aqui no servidor (o que o navegador mostrou não é
 * confiado) e só itens novos/atualizações ou decididos explicitamente pela gestão são aplicados.
 */
export async function POST(request: NextRequest) {
  return rotaFila(async ({ ator, store }) => {
    const { texto, resolucoes } = (await request.json()) as { texto?: string; resolucoes?: Record<number, Resolucao> };
    if (typeof texto !== "string" || !texto.trim()) throw new ErroRegra("Cole o conteúdo da entrada.");
    return confirmarEntrada(store, ator, texto, resolucoes ?? {});
  });
}

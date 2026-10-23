import { NextRequest } from "next/server";
import { rotaFila } from "@/lib/fila/acesso";
import { confirmarEntrada, ErroRegra, type Resolucao } from "@/lib/fila/servico";

// Sempre por requisição: depende da sessão (cookies) e nunca pode ser servida de cache.
export const dynamic = "force-dynamic";

/**
 * Publica a entrada, inteira ou por trecho (`indices`). A prévia é recalculada aqui (o navegador
 * não é confiado); cada item grava seu resultado assim que aplicado, então uma queda no meio deixa
 * comprovado o que foi salvo e a retomada aplica só o que falta.
 */
export async function POST(request: NextRequest) {
  return rotaFila(async ({ ator, store }) => {
    const { texto, resolucoes, indices } = (await request.json()) as { texto?: string; resolucoes?: Record<number, Resolucao>; indices?: number[] };
    if (typeof texto !== "string" || !texto.trim()) throw new ErroRegra("Cole o conteúdo da entrada.");
    if (indices !== undefined && !(Array.isArray(indices) && indices.every((i) => Number.isInteger(i) && i >= 0))) throw new ErroRegra("Trecho inválido.");
    return confirmarEntrada(store, ator, texto, resolucoes ?? {}, indices);
  });
}

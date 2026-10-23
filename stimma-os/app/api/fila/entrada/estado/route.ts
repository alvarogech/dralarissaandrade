import { NextRequest } from "next/server";
import { rotaFila } from "@/lib/fila/acesso";
import { ErroRegra, estadoEntrada } from "@/lib/fila/servico";

// Sempre por requisição: depende da sessão (cookies) e nunca pode ser servida de cache.
export const dynamic = "force-dynamic";

/** O que deste lote já está salvo no banco (consulta usada antes de retomar, nunca grava). */
export async function POST(request: NextRequest) {
  return rotaFila(async ({ ator, store }) => {
    const { texto } = (await request.json()) as { texto?: string };
    if (typeof texto !== "string" || !texto.trim()) throw new ErroRegra("Conteúdo do lote ausente.");
    return estadoEntrada(store, ator, texto);
  });
}

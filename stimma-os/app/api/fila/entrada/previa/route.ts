import { NextRequest } from "next/server";
import { rotaFila } from "@/lib/fila/acesso";
import { ErroRegra, previaEntrada } from "@/lib/fila/servico";

// Sempre por requisição: depende da sessão (cookies) e nunca pode ser servida de cache.
export const dynamic = "force-dynamic";

/** Prévia da entrada colada pela gestão. Não grava nada. */
export async function POST(request: NextRequest) {
  return rotaFila(async ({ ator, store }) => {
    if (!ator.gestao) throw new ErroRegra("Só a gestão pode lançar entradas.", 403);
    const { texto } = (await request.json()) as { texto?: string };
    if (typeof texto !== "string" || !texto.trim()) throw new ErroRegra("Cole o conteúdo da entrada.");
    if (texto.length > 2_000_000) throw new ErroRegra("Entrada grande demais.");
    return previaEntrada(store, texto);
  });
}

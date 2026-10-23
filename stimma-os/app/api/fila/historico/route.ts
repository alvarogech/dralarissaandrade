import { NextRequest } from "next/server";
import { rotaFila } from "@/lib/fila/acesso";
import { marcarTarefaLida } from "@/lib/fila/conversa";
import { ErroRegra, historico } from "@/lib/fila/servico";

// Sempre por requisição: depende da sessão (cookies) e nunca pode ser servida de cache.
export const dynamic = "force-dynamic";

/**
 * Histórico de um item (eventos com autor, data e horário). `ler=1` = o usuário abriu o detalhe
 * completo da tarefa: só então as atualizações contam como lidas.
 */
export async function GET(request: NextRequest) {
  return rotaFila(async ({ ator, store }) => {
    const tipo = request.nextUrl.searchParams.get("tipo");
    const id = request.nextUrl.searchParams.get("id");
    if ((tipo !== "tarefa" && tipo !== "marco") || !id) throw new ErroRegra("Item inválido.");
    const eventos = await historico(store, { tipo, id });
    if (tipo === "tarefa" && request.nextUrl.searchParams.get("ler") === "1") await marcarTarefaLida(store, ator, id);
    return { eventos };
  });
}

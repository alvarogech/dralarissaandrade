import { NextRequest } from "next/server";
import { rotaFila } from "@/lib/fila/acesso";
import { ErroRegra, historico } from "@/lib/fila/servico";

/** Histórico de um item (eventos com autor e data). */
export async function GET(request: NextRequest) {
  return rotaFila(async ({ store }) => {
    const tipo = request.nextUrl.searchParams.get("tipo");
    const id = request.nextUrl.searchParams.get("id");
    if ((tipo !== "tarefa" && tipo !== "marco") || !id) throw new ErroRegra("Item inválido.");
    return { eventos: await historico(store, { tipo, id }) };
  });
}

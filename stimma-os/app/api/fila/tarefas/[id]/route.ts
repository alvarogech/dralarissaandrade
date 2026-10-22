import { NextRequest } from "next/server";
import { rotaFila } from "@/lib/fila/acesso";
import { editarTarefa, type EdicaoTarefa } from "@/lib/fila/servico";

// Sempre por requisição: depende da sessão (cookies) e nunca pode ser servida de cache.
export const dynamic = "force-dynamic";

/** Edição pela gestão: ação, contexto, prazo, valor, responsável, cancelar (sempre com histórico). */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  return rotaFila(async ({ ator, store }) => {
    await editarTarefa(store, ator, params.id, (await request.json()) as EdicaoTarefa);
    return { ok: true };
  });
}

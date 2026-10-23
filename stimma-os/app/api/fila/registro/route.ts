import { NextRequest } from "next/server";
import { rotaFila } from "@/lib/fila/acesso";
import { registrarAtividade, type EntradaRegistro } from "@/lib/fila/registro";

// Sempre por requisição: depende da sessão (cookies) e nunca pode ser servida de cache.
export const dynamic = "force-dynamic";

/** Registro do dia: ação em tarefa existente ou registro espontâneo (mesmo formulário). */
export async function POST(request: NextRequest) {
  return rotaFila(async ({ ator, store }) => registrarAtividade(store, ator, (await request.json()) as EntradaRegistro));
}

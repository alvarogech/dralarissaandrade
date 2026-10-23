import { NextRequest } from "next/server";
import { rotaFila } from "@/lib/fila/acesso";
import { anularAtendimento, confirmarAtendimentoPendente, ErroRegra } from "@/lib/fila/servico";

// Sempre por requisição: depende da sessão (cookies) e nunca pode ser servida de cache.
export const dynamic = "force-dynamic";

/** Confirmar atendimento pendente de validação (gera sempre os três marcos) ou anular (só gestão). */
export async function POST(request: NextRequest) {
  return rotaFila(async ({ ator, store }) => {
    const b = (await request.json()) as { id?: string; operacao?: string; data?: string; motivo?: string };
    if (!b.id) throw new ErroRegra("Atendimento não informado.");
    if (b.operacao === "confirmar") await confirmarAtendimentoPendente(store, ator, b.id, b.data ?? "");
    else if (b.operacao === "anular") await anularAtendimento(store, ator, b.id, b.motivo ?? "");
    else throw new ErroRegra("Operação inválida.");
    return { ok: true };
  });
}

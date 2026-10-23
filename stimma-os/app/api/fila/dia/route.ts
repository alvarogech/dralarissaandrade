import { NextRequest } from "next/server";
import { rotaFila } from "@/lib/fila/acesso";
import { hojeSaoPaulo } from "@/lib/fila/datas";
import { salvarEstadoDoDia } from "@/lib/fila/servico";
import type { EstadoDoDia } from "@/lib/fila/store";

// Sempre por requisição: depende da sessão (cookies) e nunca pode ser servida de cache.
export const dynamic = "force-dynamic";

/** Estado do dia: prioridades escolhidas (até 5) e seções "sem ocorrências". */
export async function POST(request: NextRequest) {
  return rotaFila(async ({ ator, store }) => {
    const b = (await request.json()) as { dia?: string } & Partial<EstadoDoDia>;
    await salvarEstadoDoDia(store, ator, b.dia ?? hojeSaoPaulo(), { prioridades: b.prioridades, secoes: b.secoes });
    return { ok: true };
  });
}

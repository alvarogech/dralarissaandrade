import { NextRequest } from "next/server";
import { rotaFila } from "@/lib/fila/acesso";
import { salvarExpediente } from "@/lib/fila/servico";

// Sempre por requisição: depende da sessão (cookies) e nunca pode ser servida de cache.
export const dynamic = "force-dynamic";

/** Expediente da concierge (dias, horário de fechamento, exceções) — só a gestão altera. */
export async function POST(request: NextRequest) {
  return rotaFila(async ({ ator, store }) => {
    await salvarExpediente(store, ator, await request.json());
    return { ok: true };
  });
}

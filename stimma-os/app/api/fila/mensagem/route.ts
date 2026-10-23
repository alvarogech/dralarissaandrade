import { NextRequest } from "next/server";
import { rotaFila } from "@/lib/fila/acesso";
import { enviarMensagem, type EntradaMensagem } from "@/lib/fila/conversa";

// Sempre por requisição: depende da sessão (cookies) e nunca pode ser servida de cache.
export const dynamic = "force-dynamic";

/** Mensagem no contexto da tarefa: pergunta (concierge) ou orientação/resposta/decisão (gestão). */
export async function POST(request: NextRequest) {
  return rotaFila(async ({ ator, store }) => enviarMensagem(store, ator, (await request.json()) as EntradaMensagem));
}

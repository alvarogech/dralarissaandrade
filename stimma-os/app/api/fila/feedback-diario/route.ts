import { NextRequest } from "next/server";
import { rotaFila } from "@/lib/fila/acesso";
import { comentarFeedback, confirmarWhatsapp, entregarFeedback, estadoFeedback, gerarFeedback, listarFeedbacks, marcarCopiado } from "@/lib/fila/entrega";
import { ErroRegra } from "@/lib/fila/servico";

// Sempre por requisição: depende da sessão (cookies) e nunca pode ser servida de cache.
export const dynamic = "force-dynamic";

/** Situação do feedback do dia (própria) ou histórico (gestão: todos). */
export async function GET(request: NextRequest) {
  return rotaFila(async ({ ator, store }) => {
    const dia = request.nextUrl.searchParams.get("dia") ?? undefined;
    if (request.nextUrl.searchParams.get("historico")) return { feedbacks: await listarFeedbacks(store, ator, { dia }) };
    return estadoFeedback(store, ator.id, dia);
  });
}

/** gerar · entregar · copiado · whatsapp (concierge) · comentar (gestão). Nada é enviado ao WhatsApp. */
export async function POST(request: NextRequest) {
  return rotaFila(async ({ ator, store }) => {
    const b = (await request.json()) as { operacao?: string; id?: string; dia?: string; observacao?: string; solicitarAjuste?: boolean };
    if (!b.id) throw new ErroRegra("Feedback não informado.");
    switch (b.operacao) {
      case "gerar": return { feedback: await gerarFeedback(store, ator, { id: b.id, dia: b.dia }) };
      case "entregar": return { feedback: await entregarFeedback(store, ator, b.id) };
      case "copiado": await marcarCopiado(store, ator, b.id); return { ok: true };
      case "whatsapp": await confirmarWhatsapp(store, ator, b.id); return { ok: true };
      case "comentar": await comentarFeedback(store, ator, { id: b.id, observacao: b.observacao ?? "", solicitarAjuste: b.solicitarAjuste }); return { ok: true };
      default: throw new ErroRegra("Operação inválida.");
    }
  });
}

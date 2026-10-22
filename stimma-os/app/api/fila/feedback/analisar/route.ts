import { NextRequest } from "next/server";
import { rotaFila } from "@/lib/fila/acesso";
import { converterFeedback, iaConfigurada, type PropostaContinuidade } from "@/lib/fila/ia";
import { analisarFeedback, tarefasAbertasResumo } from "@/lib/fila/servico";

// Sempre por requisição: depende da sessão (cookies) e nunca pode ser servida de cache.
export const dynamic = "force-dynamic";

/**
 * Analisa o feedback colado: primeiro compara com o que já está registrado (determinístico);
 * se pedido e configurado, a IA propõe continuidade só para as linhas sem referência.
 * Nada é gravado aqui — as propostas voltam para revisão da gestão.
 */
export async function POST(request: NextRequest) {
  return rotaFila(async ({ ator, store }) => {
    const b = (await request.json()) as { texto?: string; usarIA?: boolean; dia?: string };
    const analise = await analisarFeedback(store, ator, String(b.texto ?? ""));
    const semRef = analise.linhas.filter((l) => l.situacao === "sem_referencia").map((l) => l.texto);
    const dia = analise.dia ?? (b.dia || null);
    let propostas: (PropostaContinuidade & { tarefaId?: string })[] | null = null;
    if (b.usarIA && semRef.length) {
      if (!dia) return { analise, propostas: null, iaDisponivel: iaConfigurada(), precisaDia: true };
      const abertas = await tarefasAbertasResumo(store);
      const porRef = new Map(abertas.map((a) => [a.ref, a.id]));
      propostas = (await converterFeedback(semRef, dia, abertas)).map((p) => ({ ...p, tarefaId: p.ref ? porRef.get(p.ref) : undefined }));
    }
    return { analise: { ...analise, dia }, propostas, iaDisponivel: iaConfigurada(), precisaDia: !dia };
  });
}

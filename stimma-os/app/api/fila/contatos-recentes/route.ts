import { NextRequest } from "next/server";
import { rotaFila } from "@/lib/fila/acesso";
import { hojeSaoPaulo, somarDias } from "@/lib/fila/datas";
import { ROTULO_RESULTADO, resultadoDoEvento } from "@/lib/fila/contato-rotina";
import { ErroRegra } from "@/lib/fila/servico";
import { podeVerCaixa as podeVerNominal } from "@/lib/fila/caixa";

// Sempre por requisição: depende da sessão (cookies) e nunca pode ser servida de cache.
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Últimos contatos registrados com uma paciente (30 dias): data, atividade e resultado — para a
 * concierge ver, antes de registrar, se já falou com ela (ex.: cobrança de segunda e de sexta).
 * Sem texto livre nem dado clínico.
 */
export async function GET(request: NextRequest) {
  return rotaFila(async ({ ator, store }) => {
    // Histórico nominal (inclui a conferência comercial): só a concierge configurada e a gestão.
    if (!(await podeVerNominal(store, ator))) throw new ErroRegra("Sem permissão para ver o histórico das pacientes.", 403);
    const id = request.nextUrl.searchParams.get("pacienteId") ?? "";
    if (!UUID.test(id)) throw new ErroRegra("Paciente inválida.");
    const eventos = await store.eventosRecentesDoPaciente(id, somarDias(hojeSaoPaulo(), -30));
    return {
      contatos: eventos.filter((e) => e.kind !== "nota").slice(0, 5).map((e) => {
        const d = (e.payload?.detalhes ?? {}) as Record<string, unknown>;
        const r = resultadoDoEvento(e.payload);
        return { dia: e.occurredOn, atividade: typeof d.acao === "string" ? d.acao : e.categoria ?? e.kind, resultado: r ? ROTULO_RESULTADO[r] : e.situacao ?? "", marco: typeof d.marco === "string" ? d.marco : null };
      }),
    };
  });
}

import type { TarefaRow } from "./store";

/**
 * Cobranças rotineiras × exceções.
 *
 * A conferência de parcelas vencidas é uma rotina da concierge no Simples Dental (segundas e
 * sextas, item "cobrancas_simples_dental" da rotina), registrada só com quantidades. Por isso uma
 * tarefa de cobrança individual só fica na fila operacional quando é EXCEÇÃO:
 *  - marcada como exceção pela gestão (payload.excecao = true: criada à mão pela gestão, publicada
 *    como exceção na entrada ou mantida como exceção na visão administrativa);
 *  - aguardando decisão da gestão;
 *  - marcada como ponto de atenção.
 * As demais tarefas de cobrança abertas (legado de levantamentos importados) saem da fila da
 * concierge e do feedback, mas NÃO são apagadas, encerradas nem alteradas: continuam no banco, na
 * lista da gestão (Entrada e tarefas › Tarefas) e na trilha de auditoria. Regra só de leitura.
 */
export function cobrancaRotineira(t: Pick<TarefaRow, "kind" | "status" | "payload" | "aguardando">): boolean {
  if (t.kind !== "cobranca") return false;
  if (t.status === "completed" || t.status === "cancelled") return false;
  if (t.payload?.excecao === true || t.payload?.atencao === true) return false;
  if (t.status === "waiting" && t.aguardando === "gestao") return false;
  return true;
}

/** Resumo de uma cobrança individual antiga, para a visão administrativa (só gestão vê os nomes). */
export interface CobrancaLegada {
  id: string;
  ref: string;
  paciente: string;
  titulo: string;
  due: string;
  aguardandoPaciente: boolean;
}

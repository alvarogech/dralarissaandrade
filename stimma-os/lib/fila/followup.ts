import { somarDias } from "./datas";
import type { Categoria, SimNao, TarefaRow } from "./store";

/**
 * Regra global de retorno: TODO contato sem resposta gera uma próxima tentativa rastreável.
 *
 * "Sem resposta" = tentativa não realizada/sem contato (contato = não) ou contato feito sem resposta
 * (contato = sim, resposta = não). O registro do dia (registro.ts) aplica a regra no servidor, para
 * qualquer fluxo (rotina, pendência da fila, registro livre): exige próxima ação + data, preenche a
 * data pelo prazo padrão quando não veio, e reaproveita o acompanhamento aberto da mesma paciente e do
 * mesmo assunto em vez de criar outro (cada tentativa fica no histórico, ligada à mesma tarefa).
 *
 * Os prazos abaixo são parâmetros operacionais iniciais (não regras clínicas) e ficam só aqui.
 */
export type TipoFollowup = "pos_procedimento" | "continuidade" | "recorrencia" | "reativacao" | "cobranca" | "confirmacao" | "padrao";

/** Dias úteis até a próxima tentativa. Cobrança segue o próximo ciclo (segunda/sexta); confirmação, antes da consulta. */
export const PRAZOS_FOLLOWUP: Record<Exclude<TipoFollowup, "cobranca" | "confirmacao">, number> & { confirmacao: number } = {
  pos_procedimento: 1,
  continuidade: 2,
  recorrencia: 3,
  reativacao: 3,
  padrao: 1,
  confirmacao: 1,
};

export const ROTULO_FOLLOWUP: Record<TipoFollowup, string> = {
  pos_procedimento: "Pós-procedimento", continuidade: "Continuidade do tratamento", recorrencia: "Recorrência e manutenção",
  reativacao: "Reativação de paciente", cobranca: "Cobrança", confirmacao: "Confirmação de consulta", padrao: "Contato",
};

const diaDaSemana = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d).getDay();
};

export function somarDiasUteis(dia: string, n: number): string {
  let d = dia;
  let faltam = Math.max(1, n);
  while (faltam > 0) {
    d = somarDias(d, 1);
    const w = diaDaSemana(d);
    if (w !== 0 && w !== 6) faltam--;
  }
  return d;
}

/** Próximo dia de cobrança (segunda ou sexta) depois de `dia`. */
export function proximoCicloCobranca(dia: string): string {
  let d = somarDias(dia, 1);
  while (![1, 5].includes(diaDaSemana(d))) d = somarDias(d, 1);
  return d;
}

/** Tipo de retorno pela atividade da rotina (quando houver) ou pela área do registro. */
export function tipoFollowup(categoria: Categoria, rotinaItem?: string | null, detalhes?: Record<string, string>): TipoFollowup {
  if (detalhes?.tipo_ocorrencia === "confirmacao") return "confirmacao";
  switch (rotinaItem) {
    case "pos_procedimento_ontem": return "pos_procedimento";
    case "pos_procedimento": return "continuidade";
    case "resgate_10_meses": return "reativacao";
    case "cobrancas_simples_dental": return "cobranca";
  }
  if (rotinaItem?.startsWith("contatos_")) return "recorrencia";
  switch (categoria) {
    case "pos_atendimento": return "pos_procedimento";
    case "continuidade": return "continuidade";
    case "recorrencia": case "relacionamento": return "recorrencia";
    default: return "padrao";
  }
}

/**
 * Data padrão da próxima tentativa. Confirmação nunca passa da data da consulta (se a consulta é
 * hoje, a nova tentativa é hoje mesmo); cobrança vai para o próximo ciclo, sem passar do prazo
 * da pendência quando ele é anterior.
 */
export function prazoFollowup(tipo: TipoFollowup, hoje: string, opts: { dataConsulta?: string | null; prazoPendencia?: string | null } = {}): string {
  if (tipo === "cobranca") {
    const ciclo = proximoCicloCobranca(hoje);
    return opts.prazoPendencia && opts.prazoPendencia >= hoje && opts.prazoPendencia < ciclo ? opts.prazoPendencia : ciclo;
  }
  if (tipo === "confirmacao") {
    const d = somarDiasUteis(hoje, PRAZOS_FOLLOWUP.confirmacao);
    return opts.dataConsulta && d > opts.dataConsulta ? (opts.dataConsulta >= hoje ? opts.dataConsulta : hoje) : d;
  }
  return somarDiasUteis(hoje, PRAZOS_FOLLOWUP[tipo]);
}

export function semResposta(contato: SimNao | null, resposta: SimNao | null): boolean {
  return contato === "nao" || (contato === "sim" && resposta === "nao");
}

/** Assunto do acompanhamento (mesma paciente + mesmo assunto = o mesmo retorno, reprogramado). */
export function chaveFollowup(categoria: Categoria, rotinaItem?: string | null): string {
  return rotinaItem ? `rotina:${rotinaItem}` : `area:${categoria}`;
}

/** Retorno aberto da mesma paciente e do mesmo assunto (o mais antigo, para não espalhar o histórico). */
export function followupAberto(abertas: TarefaRow[], chave: string): TarefaRow | null {
  return abertas.filter((t) => t.payload?.followup === chave).sort((a, b) => (a.criadoEm ?? "").localeCompare(b.criadoEm ?? ""))[0] ?? null;
}

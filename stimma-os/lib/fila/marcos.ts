import { somarDias, somarMeses } from "./datas";

/**
 * Marcos automáticos de acompanhamento. Espelha, em TypeScript puro, a regra da função
 * `confirmar_atendimento_realizado` (migration 0012) — usado na prévia da entrada e nos testes.
 * A fonte de verdade em produção é a função do banco (transação única, unique(appointment_id, kind)).
 */
export const TIPOS_MARCO = ["d30", "d90", "m6"] as const;
export type TipoMarco = (typeof TIPOS_MARCO)[number];

export const ROTULO_MARCO: Record<TipoMarco, string> = { d30: "30 dias", d90: "90 dias", m6: "6 meses" };

export type StatusMarco = "previsto" | "contatado" | "contemplado" | "dispensado" | "invalidado";

export function datasDosMarcos(dataAtendimento: string): Record<TipoMarco, string> {
  return {
    d30: somarDias(dataAtendimento, 30),
    d90: somarDias(dataAtendimento, 90),
    m6: somarMeses(dataAtendimento, 6),
  };
}

export interface MarcoExistente {
  kind: TipoMarco;
  status: StatusMarco;
  dueOriginal: string;
  temEventoVinculado: boolean;
}

export type AcaoMarco =
  | { kind: TipoMarco; acao: "inserir"; due: string }
  | { kind: TipoMarco; acao: "recalcular"; de: string; due: string }
  | { kind: TipoMarco; acao: "manter"; due: string; motivo: string };

/** Marco ainda não trabalhado: pode ter as datas recalculadas ou ser invalidado. */
export function marcoIntocado(m: MarcoExistente): boolean {
  return m.status === "previsto" && !m.temEventoVinculado;
}

/**
 * O que acontece com os 3 marcos ao confirmar (ou corrigir a data de) um atendimento realizado.
 * Nunca gera parcial: sempre devolve exatamente uma ação por tipo de marco.
 */
export function planejarMarcos(dataAtendimento: string, existentes: MarcoExistente[]): AcaoMarco[] {
  const datas = datasDosMarcos(dataAtendimento);
  return TIPOS_MARCO.map((kind): AcaoMarco => {
    const ex = existentes.find((m) => m.kind === kind);
    const due = datas[kind];
    if (!ex) return { kind, acao: "inserir", due };
    if (ex.dueOriginal === due) return { kind, acao: "manter", due, motivo: "já existe com a mesma data" };
    if (marcoIntocado(ex)) return { kind, acao: "recalcular", de: ex.dueOriginal, due };
    return { kind, acao: "manter", due: ex.dueOriginal, motivo: "já trabalhado — histórico preservado" };
  });
}

/** Anulação de lançamento feito por engano: invalida só os marcos intocados. */
export function planejarAnulacao(existentes: MarcoExistente[]): { kind: TipoMarco; acao: "invalidar" | "manter" }[] {
  return existentes.map((m) => ({ kind: m.kind, acao: marcoIntocado(m) ? "invalidar" : "manter" }));
}

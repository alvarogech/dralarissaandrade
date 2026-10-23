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

/** Valida a escolha de marcos de um atendimento (subconjunto de d30/d90/m6, sem repetição). */
export function marcosValidos(v: unknown): v is TipoMarco[] {
  return Array.isArray(v) && v.every((k) => (TIPOS_MARCO as readonly string[]).includes(k)) && new Set(v).size === v.length;
}

/**
 * O que acontece com os marcos ESCOLHIDOS ao confirmar (ou corrigir a data de) um atendimento
 * realizado — por padrão os três (regra da 0012); a orientação clínica pode indicar só alguns.
 * Devolve exatamente uma ação por marco escolhido; marcos já existentes de outros tipos não são
 * tocados (nunca apagados nem reclassificados).
 */
export function planejarMarcos(dataAtendimento: string, existentes: MarcoExistente[], escolhidos: readonly TipoMarco[] = TIPOS_MARCO): AcaoMarco[] {
  const datas = datasDosMarcos(dataAtendimento);
  return TIPOS_MARCO.filter((k) => escolhidos.includes(k)).map((kind): AcaoMarco => {
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

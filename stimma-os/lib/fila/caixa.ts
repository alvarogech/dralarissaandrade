import { hojeSaoPaulo, isDiaIso } from "./datas";
import { ErroRegra, type Ator } from "./servico";
import type { ConferenciaCaixa, FilaStore } from "./store";

/**
 * Conferência de recebimentos do dia: totais previsto × recebido conferidos no Simples Dental (a
 * fonte oficial). O STIMMA OS só registra a conferência para a prestação de contas — sem valores por
 * paciente, dados bancários ou de cartão. Diferença = previsto − recebido, e diferença não é
 * inadimplência: pode ser remarcação, cancelamento, antecipação ou acerto de fechamento (por isso a
 * justificativa). Quem vê: a concierge identificada na configuração e a gestão (conferido aqui no
 * servidor; a tabela não tem leitura pelo navegador).
 */
export const MAX_VALOR_CAIXA = 10_000_000;

export type EstadoCaixa =
  | { tipo: "nao_conferido" }
  | { tipo: "sem_recebimentos"; conferidoEm: string }
  | { tipo: "conferido"; previsto: number; recebido: number; diferenca: number; justificativa: string | null; conferidoEm: string };

export function estadoCaixa(c: ConferenciaCaixa | null): EstadoCaixa {
  if (!c) return { tipo: "nao_conferido" };
  if (c.situacao === "sem_recebimentos") return { tipo: "sem_recebimentos", conferidoEm: c.conferidoEm };
  const previsto = c.previsto ?? 0;
  const recebido = c.recebido ?? 0;
  return { tipo: "conferido", previsto, recebido, diferenca: diferencaCaixa(previsto, recebido), justificativa: c.justificativa, conferidoEm: c.conferidoEm };
}

/** previsto − recebido, em centavos para não acumular erro de ponto flutuante. */
export function diferencaCaixa(previsto: number, recebido: number): number {
  return (Math.round(previsto * 100) - Math.round(recebido * 100)) / 100;
}

export async function podeVerCaixa(store: FilaStore, ator: Ator): Promise<boolean> {
  if (ator.gestao) return true;
  const config = await store.config();
  return !!config.conciergeId && config.conciergeId === ator.id;
}

export async function carregarCaixa(store: FilaStore, ator: Ator, dia = hojeSaoPaulo()): Promise<EstadoCaixa> {
  if (!isDiaIso(dia)) throw new ErroRegra("Dia inválido.");
  if (!(await podeVerCaixa(store, ator))) throw new ErroRegra("Os valores de recebimento são restritos à concierge e à gestão.", 403);
  return estadoCaixa(await store.conferenciaCaixa(dia));
}

export interface EntradaCaixa {
  semRecebimentos?: boolean;
  previsto?: number | null;
  recebido?: number | null;
  justificativa?: string | null;
}

const valor = (v: unknown, rotulo: string): number => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > MAX_VALOR_CAIXA) throw new ErroRegra(`${rotulo}: informe um valor em reais (zero ou mais).`);
  return Math.round(v * 100) / 100;
};

/** Só a concierge registra a conferência do próprio dia (a gestão consulta). */
export async function salvarCaixa(store: FilaStore, ator: Ator, e: EntradaCaixa): Promise<EstadoCaixa> {
  if (ator.gestao) throw new ErroRegra("A conferência de recebimentos é registrada pela concierge; a gestão consulta.", 403);
  if (!(await podeVerCaixa(store, ator))) throw new ErroRegra("Os valores de recebimento são restritos à concierge e à gestão.", 403);
  const dia = hojeSaoPaulo();
  const justificativa = typeof e.justificativa === "string" && e.justificativa.trim() ? e.justificativa.trim().slice(0, 500) : null;
  const c: ConferenciaCaixa = e.semRecebimentos
    ? { dia, situacao: "sem_recebimentos", previsto: null, recebido: null, justificativa, conferidoPor: ator.id, conferidoEm: new Date().toISOString() }
    : { dia, situacao: "conferido", previsto: valor(e.previsto, "Previsto"), recebido: valor(e.recebido, "Recebido"), justificativa, conferidoPor: ator.id, conferidoEm: new Date().toISOString() };
  await store.salvarConferenciaCaixa(c);
  // Auditoria sem os valores (só que houve conferência e se há divergência).
  const est = estadoCaixa(c);
  await store.auditar({ actor: ator.email, action: "fila_conferencia_caixa", target: `daily_cash_reviews/${dia}`, after: { situacao: c.situacao, divergencia: est.tipo === "conferido" ? est.diferenca !== 0 : false, justificativa: !!justificativa } });
  return est;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Linha da prestação de contas (só vai no feedback, que é visto pela concierge e pela gestão). */
export function textoCaixa(e: EstadoCaixa): string {
  switch (e.tipo) {
    case "nao_conferido": return "Conferência de recebimentos não realizada hoje.";
    case "sem_recebimentos": return "Conferido: sem recebimentos hoje.";
    case "conferido": {
      const dif = e.diferenca === 0 ? "sem diferença" : `diferença de ${brl(e.diferenca)}${e.justificativa ? ` — ${e.justificativa}` : " — sem justificativa registrada"}`;
      return `Previsto ${brl(e.previsto)} · recebido ${brl(e.recebido)} · ${dif}.`;
    }
  }
}

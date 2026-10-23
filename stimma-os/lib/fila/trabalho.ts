import { somarDias } from "./datas";
import type { ItemFila } from "./agrupamento";

/**
 * Visão de trabalho comum (gestão e concierge): tarefas manuais, importadas, conferências de
 * atendimento e marcos de acompanhamento na mesma lista, sem fundir tabelas. Cada item cai em
 * UMA situação só — assim os indicadores somam e abrem exatamente a lista que contaram:
 *
 *  - atrasada            → aberta (ou aguardando paciente) com data já vencida;
 *  - hoje                → aberta (ou aguardando paciente com revisão marcada) para hoje;
 *  - aguardando_paciente → contato feito, revisão marcada para depois de hoje;
 *  - aguardando_gestao   → pergunta/impedimento com a gestão, qualquer data;
 *  - proxima             → aberta com data futura;
 *  - concluida           → resolvida ou encerrada (recentemente).
 */
export const SITUACOES_TRABALHO = ["atrasada", "hoje", "aguardando_paciente", "aguardando_gestao", "proxima", "concluida"] as const;
export type SituacaoTrabalho = (typeof SITUACOES_TRABALHO)[number];

export const ROTULO_SITUACAO_TRABALHO: Record<SituacaoTrabalho, string> = {
  atrasada: "Atrasadas", hoje: "Hoje", aguardando_paciente: "Aguardando paciente", aguardando_gestao: "Aguardando gestão", proxima: "Próximas", concluida: "Concluídas",
};

/** Marcos de acompanhamento só entram na lista padrão quando faltam até tantos dias (registro agrupado também usa). */
export const JANELA_MARCOS_DIAS = 7;

export function situacaoTrabalho(i: ItemFila, hoje: string): SituacaoTrabalho {
  if (i.status === "concluida") return "concluida";
  if (i.status === "aguardando" && i.aguardando === "gestao") return "aguardando_gestao";
  if (i.due < hoje) return "atrasada";
  if (i.due === hoje) return "hoje";
  return i.status === "aguardando" ? "aguardando_paciente" : "proxima";
}

export type Responsavel = "eu" | "concierge" | "gestor" | "sem" | "todos";

export interface FiltrosTrabalho {
  situacoes: SituacaoTrabalho[];
  responsavel: Responsavel;
  /** tipo do item (marco, cobranca, pendencia…) ou "" para todos */
  tipo: string;
  /** origem (simples_dental, manual, registro do dia, marco automático…) ou "" */
  origem: string;
  prioridade: "" | "alta" | "normal" | "baixa";
  busca: string;
  /** só itens com data até este dia (AAAA-MM-DD) ou "" */
  ate: string;
  /** "Depende de mim": responsável sou eu ou a tarefa ainda não tem responsável. */
  dependeDeMim: boolean;
}

export const FILTROS_PADRAO: FiltrosTrabalho = { situacoes: ["atrasada", "hoje"], responsavel: "todos", tipo: "", origem: "", prioridade: "", busca: "", ate: "", dependeDeMim: false };

export interface Pessoas {
  eu: string;
  conciergeId: string | null;
  gestorId: string | null;
}

function normalizar(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Responsável efetivo: marcos e conferências são rotina da concierge. */
export function responsavelEfetivo(i: ItemFila, p: Pessoas): string | null {
  if (i.responsavelId) return i.responsavelId;
  if (i.tipo === "marco" || i.tipo === "conferir_atendimento") return p.conciergeId;
  return null;
}

/** Filtros exceto situação — base comum dos indicadores (o número do cartão = a lista que ele abre). */
export function filtrarBase(itens: ItemFila[], f: FiltrosTrabalho, p: Pessoas): ItemFila[] {
  const busca = normalizar(f.busca.trim());
  return itens.filter((i) => {
    const resp = responsavelEfetivo(i, p);
    if (f.dependeDeMim && !(resp === p.eu || (!resp && i.alvo?.tipo === "tarefa"))) return false;
    // A concierge continua vendo os casos dela que estão esperando a gestão (a próxima ação é da gestão, o caso segue dela).
    if (f.responsavel === "eu" && resp !== p.eu && !(i.aguardando === "gestao" && p.eu === p.conciergeId)) return false;
    if (f.responsavel === "concierge" && (!p.conciergeId || resp !== p.conciergeId)) return false;
    if (f.responsavel === "gestor" && (!p.gestorId || resp !== p.gestorId)) return false;
    if (f.responsavel === "sem" && resp) return false;
    if (f.tipo && (f.tipo === "comparecimento" ? i.subtipo !== "comparecimento" : i.tipo !== f.tipo)) return false;
    if (f.origem && (i.origem ?? "") !== f.origem) return false;
    if (f.prioridade && (i.prioridade ?? "normal") !== f.prioridade) return false;
    if (f.ate && i.status !== "concluida" && i.due > f.ate) return false;
    if (busca && !normalizar(`${i.pacienteNome} ${i.titulo} ${i.contexto ?? ""}`).includes(busca)) return false;
    return true;
  });
}

export function contarPorSituacao(itens: ItemFila[], hoje: string): Record<SituacaoTrabalho, number> {
  const c = Object.fromEntries(SITUACOES_TRABALHO.map((s) => [s, 0])) as Record<SituacaoTrabalho, number>;
  for (const i of itens) c[situacaoTrabalho(i, hoje)]++;
  return c;
}

export function filtrarTrabalho(itens: ItemFila[], f: FiltrosTrabalho, p: Pessoas, hoje: string): ItemFila[] {
  const sit = new Set(f.situacoes);
  const ordem = (i: ItemFila) => SITUACOES_TRABALHO.indexOf(situacaoTrabalho(i, hoje));
  const prio = (i: ItemFila) => (i.prioridade === "alta" ? 0 : i.prioridade === "baixa" ? 2 : 1);
  return filtrarBase(itens, f, p)
    .filter((i) => !sit.size || sit.has(situacaoTrabalho(i, hoje)))
    .sort((a, b) => ordem(a) - ordem(b) || prio(a) - prio(b) || a.due.localeCompare(b.due) || a.pacienteNome.localeCompare(b.pacienteNome, "pt-BR"));
}

/** Marco futuro além da janela de trabalho: fica recolhido por padrão e exige justificativa para registrar junto. */
export function marcoForaDaJanela(i: ItemFila, hoje: string): boolean {
  return i.tipo === "marco" && i.status !== "concluida" && i.due > somarDias(hoje, JANELA_MARCOS_DIAS);
}

/** Filtros ⇄ query string (abrir/fechar detalhe ou recarregar preserva a lista). */
export function filtrosParaQuery(f: FiltrosTrabalho): string {
  const q = new URLSearchParams();
  if (f.situacoes.join(",") !== FILTROS_PADRAO.situacoes.join(",")) q.set("sit", f.situacoes.join(",") || "todas");
  for (const k of ["responsavel", "tipo", "origem", "prioridade", "busca", "ate"] as const) if (f[k] && f[k] !== FILTROS_PADRAO[k]) q.set(k, f[k]);
  if (f.dependeDeMim) q.set("mim", "1");
  return q.toString();
}

export function filtrosDaQuery(q: Record<string, string | undefined>, base: FiltrosTrabalho = FILTROS_PADRAO): FiltrosTrabalho {
  const sit = q.sit === "todas" ? [] : q.sit ? q.sit.split(",").filter((s): s is SituacaoTrabalho => (SITUACOES_TRABALHO as readonly string[]).includes(s)) : base.situacoes;
  const resp = (["eu", "concierge", "gestor", "sem", "todos"] as const).find((r) => r === q.responsavel) ?? base.responsavel;
  const prio = (["alta", "normal", "baixa"] as const).find((r) => r === q.prioridade) ?? "";
  return { situacoes: sit, responsavel: resp, tipo: q.tipo ?? "", origem: q.origem ?? "", prioridade: prio, busca: q.busca ?? "", ate: q.ate ?? "", dependeDeMim: q.mim === "1" || (q.mim === undefined && base.dependeDeMim) };
}

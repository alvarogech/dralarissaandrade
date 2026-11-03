import type { EntradaRegistro } from "./registro";
import { hojeSaoPaulo } from "./datas";
import { conferido, detalhesPlanejamento, precisaPendencia, validarPlanejamento, type EntradaPlanejamento } from "./planejamento";

/**
 * Conferência comercial da Mel (auditoria diária feita pela Gabi). A Mel executa o comercial; a Gabi
 * confere e registra NOMINALMENTE o que verificou; a gestão acompanha. Cada paciente conferida vira um
 * registro do dia (o mesmo mecanismo de sempre) ligado à atividade `conferencia_mel`, com os campos
 * da conferência em `detalhes`. Não é contato da Gabi: contato/resposta ficam vazios, para não somar
 * nos indicadores dela. Pendência comercial fica com a Mel ("comercial_externa") e usa a mesma regra
 * de retorno sem duplicar (mesma paciente + mesmo assunto = o mesmo acompanhamento, reprogramado).
 * Nada de cópia de conversa: só um resumo operacional curto, sem dado clínico.
 */
export const ITEM_CONFERENCIA = "conferencia_mel";

export const GRUPOS_COMERCIAIS = [
  ["novo_lead", "Novo lead"],
  ["follow_up", "Follow-up comercial"],
  ["agendamento", "Agendamento"],
  ["oportunidade", "Oportunidade pendente"],
  ["divergencia", "Divergência"],
  ["outro", "Outra movimentação"],
] as const;
export type GrupoComercial = (typeof GRUPOS_COMERCIAIS)[number][0];

export const SITUACOES_COMERCIAIS = [
  ["nao_atendida", "Não atendida"],
  ["atendimento_iniciado", "Atendimento iniciado"],
  ["aguardando_paciente", "Aguardando resposta da paciente"],
  ["aguardando_mel", "Aguardando retorno da Mel"],
  ["followup_realizado", "Follow-up realizado"],
  ["avaliacao_agendada", "Avaliação agendada"],
  ["sem_interesse", "Sem interesse no momento"],
  ["encaminhada", "Encaminhada para outra providência"],
] as const;
export type SituacaoComercial = (typeof SITUACOES_COMERCIAIS)[number][0];

/** Como a Gabi conferiu. "Informado pela Mel" nunca conta como verificado. */
export const CONFERENCIAS = [
  ["conversa", "Conferido na conversa"],
  ["simples_dental", "Conferido no Simples Dental"],
  ["informado_mel", "Informado pela Mel, não verificado"],
  ["divergencia", "Divergência identificada"],
  ["nao_conferido", "Não foi possível conferir"],
] as const;
export type Conferencia = (typeof CONFERENCIAS)[number][0];

export const DIVERGENCIAS = [
  ["lead_sem_atendimento", "Lead sem atendimento"],
  ["sem_followup", "Paciente sem follow-up"],
  ["agendamento_nao_localizado", "Agendamento não localizado no Simples Dental"],
  ["sem_proxima_acao", "Sem próxima ação"],
  ["informacao_conflitante", "Informação diferente entre o feedback da Mel e a conversa"],
  ["outra", "Outra ocorrência"],
] as const;

export const RESPONSAVEIS_COMERCIAIS = [
  ["comercial_externa", "Mel (comercial)"],
  ["gabi", "Gabi"],
  ["gestao", "Gestão"],
] as const;

const rot = <T extends readonly (readonly [string, string])[]>(lista: T, k: string | undefined | null) => lista.find(([x]) => x === k)?.[1] ?? "";
export const rotuloGrupo = (k?: string | null) => rot(GRUPOS_COMERCIAIS, k);
export const rotuloSituacao = (k?: string | null) => rot(SITUACOES_COMERCIAIS, k);
export const rotuloConferencia = (k?: string | null) => rot(CONFERENCIAS, k);
export const rotuloDivergencia = (k?: string | null) => rot(DIVERGENCIAS, k);
export const rotuloResponsavel = (k?: string | null) => rot(RESPONSAVEIS_COMERCIAIS, k);

export interface EntradaConferencia {
  eventoId: string;
  pacienteId?: string | null;
  /** Identificação provisória de lead ainda não cadastrado (vira cadastro explícito, sem código inventado). */
  nomeNovo?: string;
  grupo: GrupoComercial | "";
  servico?: string;
  situacao: SituacaoComercial | "";
  conferencia: Conferencia | "";
  motivoNaoConferido?: string;
  agendamento?: { data: string; hora?: string; profissional?: string };
  divergencia?: string;
  resultado: string;
  pendencia?: { responsavel: "comercial_externa" | "gabi" | "gestao"; acao: string; prazo: string } | null;
  /** Planejamento anual apresentado na conversa comercial (opcional; "não informado" quando ausente). */
  planejamento?: EntradaPlanejamento | null;
}

/** O planejamento informado exige próxima ação? (aberto, fechamento não conferido ou a confirmar) */
export function planejamentoPedePendencia(e: Pick<EntradaConferencia, "planejamento" | "conferencia">): boolean {
  const p = e.planejamento;
  return !!p?.resposta && precisaPendencia(p, conferido({ planejamento_conferencia: e.conferencia }));
}

const t = (v?: string | null) => (v ?? "").trim();

export function precisaAgendamento(e: Pick<EntradaConferencia, "grupo" | "situacao">) {
  return e.grupo === "agendamento" || e.situacao === "avaliacao_agendada";
}
export function precisaDivergencia(e: Pick<EntradaConferencia, "grupo" | "conferencia">) {
  return e.grupo === "divergencia" || e.conferencia === "divergencia";
}

/** Validação junto do campo (o servidor confere o essencial de novo). */
export function validarConferencia(e: Omit<EntradaConferencia, "eventoId">, hoje: string): [string, string][] {
  const erros: [string, string][] = [];
  if (!e.pacienteId && !t(e.nomeNovo)) erros.push(["paciente", "Informe a paciente (nome): a conferência é nominal."]);
  if (!e.grupo) erros.push(["grupo", "Diga o tipo de movimentação."]);
  if (!e.situacao) erros.push(["situacao", "Escolha a situação do contato."]);
  if (!e.conferencia) erros.push(["conferencia", "Diga como você conferiu."]);
  if (e.conferencia === "nao_conferido" && !t(e.motivoNaoConferido)) erros.push(["motivo", "Diga por que não foi possível conferir."]);
  if (precisaAgendamento(e) && !e.agendamento?.data) erros.push(["agendaData", "Informe a data do agendamento."]);
  if (precisaDivergencia(e) && !e.divergencia) erros.push(["divergencia", "Escolha o tipo de divergência."]);
  if (!t(e.resultado)) erros.push(["resultado", "Escreva em poucas palavras o que aconteceu."]);
  if (e.planejamento?.resposta) erros.push(...validarPlanejamento(e.planejamento, "whatsapp", hoje));
  if (planejamentoPedePendencia(e) && !e.pendencia) erros.push(["temPendencia", "Proposta em aberto: defina a próxima ação, o responsável e o prazo."]);
  if (e.pendencia) {
    if (!t(e.pendencia.acao)) erros.push(["acao", "Escreva a ação necessária."]);
    if (!e.pendencia.prazo || e.pendencia.prazo < hoje) erros.push(["prazo", "Escolha a data (hoje ou depois)."]);
  }
  return erros;
}

/** Monta o registro do dia (mesmo endpoint e regras de qualquer registro). */
export function registroDaConferencia(e: EntradaConferencia, usuarioId: string, hoje = hojeSaoPaulo()): Omit<EntradaRegistro, "data"> {
  const detalhes: Record<string, string> = {
    rotina_item: ITEM_CONFERENCIA, acao: "Conferência comercial — Mel", grupo: e.grupo, situacao_comercial: e.situacao, conferencia: e.conferencia,
    resultado_conferencia: t(e.resultado),
  };
  if (t(e.servico)) detalhes.servico = t(e.servico);
  if (t(e.motivoNaoConferido)) detalhes.motivo_nao_conferido = t(e.motivoNaoConferido);
  if (e.agendamento?.data) {
    detalhes.agendamento_data = e.agendamento.data;
    if (t(e.agendamento.hora)) detalhes.agendamento_hora = t(e.agendamento.hora);
    if (t(e.agendamento.profissional)) detalhes.agendamento_profissional = t(e.agendamento.profissional);
  }
  if (e.divergencia) detalhes.divergencia = e.divergencia;
  if (e.pendencia) detalhes.responsavel_pendencia = e.pendencia.responsavel;
  if (e.planejamento?.resposta) Object.assign(detalhes, detalhesPlanejamento({ ...e.planejamento, responsavel: e.planejamento.responsavel || "Mel" }, "whatsapp", hoje, e.conferencia));
  const p = e.pendencia;
  const responsavel = !p ? undefined : p.responsavel === "gabi" ? `perfil:${usuarioId}` : p.responsavel;
  return {
    eventoId: e.eventoId, alvos: [], categoria: "oportunidade",
    pacienteId: e.pacienteId || null, novoPaciente: !e.pacienteId && t(e.nomeNovo) ? { nome: t(e.nomeNovo) } : undefined,
    contexto: "Conferência comercial — Mel", contato: null, resposta: null,
    feito: `${rotuloGrupo(e.grupo)}: ${t(e.resultado)}`,
    situacao: p ? "pendente" : "informativo",
    ...(p ? { proximaAcao: t(p.acao), prazo: p.prazo, responsavel } : {}),
    detalhes,
  };
}

/** Registro de conferência já gravado (vindo do evento), para a lista e o fechamento. */
export interface RegistroComercial {
  eventoId: string;
  pacienteId: string | null;
  paciente: string;
  detalhes: Record<string, string>;
  proxima: string | null;
  prazo: string | null;
}

export interface ResumoComercial {
  semMovimentacao: boolean;
  pacientesUnicas: number;
  novosLeads: number;
  leadsAtendidos: number;
  leadsSemAtendimento: number;
  followups: number;
  comResposta: number;
  semResposta: number;
  agendadas: number;
  agendamentosConferidos: number;
  oportunidades: number;
  divergencias: number;
  verificados: number;
  naoVerificados: number;
  pendencias: number;
}

const SEM_RESPOSTA_COMERCIAL = ["nao_atendida", "aguardando_paciente", "aguardando_mel"];

export function resumirComercial(regs: RegistroComercial[], semMovimentacao = false): ResumoComercial {
  const g = (k: string) => regs.filter((r) => r.detalhes.grupo === k);
  const leads = g("novo_lead");
  const fups = g("follow_up");
  return {
    semMovimentacao: semMovimentacao && !regs.length,
    pacientesUnicas: new Set(regs.map((r) => r.pacienteId ?? r.paciente.toLowerCase())).size,
    novosLeads: leads.length,
    leadsAtendidos: leads.filter((r) => r.detalhes.situacao_comercial !== "nao_atendida").length,
    leadsSemAtendimento: leads.filter((r) => r.detalhes.situacao_comercial === "nao_atendida").length,
    followups: fups.length,
    comResposta: fups.filter((r) => !SEM_RESPOSTA_COMERCIAL.includes(r.detalhes.situacao_comercial ?? "")).length,
    semResposta: fups.filter((r) => SEM_RESPOSTA_COMERCIAL.includes(r.detalhes.situacao_comercial ?? "")).length,
    agendadas: regs.filter((r) => r.detalhes.situacao_comercial === "avaliacao_agendada" || r.detalhes.grupo === "agendamento").length,
    agendamentosConferidos: regs.filter((r) => r.detalhes.agendamento_data && r.detalhes.conferencia === "simples_dental").length,
    oportunidades: g("oportunidade").length,
    divergencias: regs.filter((r) => r.detalhes.grupo === "divergencia" || r.detalhes.conferencia === "divergencia").length,
    verificados: regs.filter((r) => r.detalhes.conferencia === "conversa" || r.detalhes.conferencia === "simples_dental").length,
    naoVerificados: regs.filter((r) => r.detalhes.conferencia === "informado_mel" || r.detalhes.conferencia === "nao_conferido").length,
    pendencias: regs.filter((r) => r.proxima).length,
  };
}

const dataBr = (iso: string) => iso.split("-").reverse().join("/");

/** Uma linha nominal: "Maria S. — Harmonização. Atendimento iniciado: … Conferência: …" */
export function linhaComercial(r: RegistroComercial, nome: (n: string) => string = (n) => n): string {
  const d = r.detalhes;
  const partes = [
    d.servico ? `interesse: ${d.servico}` : "",
    rotuloSituacao(d.situacao_comercial),
    d.resultado_conferencia ?? "",
    d.agendamento_data ? `agendado ${dataBr(d.agendamento_data)}${d.agendamento_hora ? ` às ${d.agendamento_hora}` : ""}${d.agendamento_profissional ? ` com ${d.agendamento_profissional}` : ""}` : "",
    d.divergencia ? `divergência: ${rotuloDivergencia(d.divergencia)}` : "",
    `conferência: ${rotuloConferencia(d.conferencia).replace(/^\p{Lu}/u, (c) => c.toLowerCase())}${d.motivo_nao_conferido ? ` (${d.motivo_nao_conferido})` : ""}`,
    r.proxima ? `próxima ação: ${rotuloResponsavel(d.responsavel_pendencia) || "responsável"} — ${r.proxima}${r.prazo ? ` até ${dataBr(r.prazo)}` : ""}` : "",
  ].filter(Boolean);
  return `${nome(r.paciente)} — ${partes.join(". ")}`;
}

/** Seção da prestação de contas: números + nomes agrupados por situação. */
export function textoComercial(regs: RegistroComercial[], semMovimentacao: boolean, pendentesAbertas: { paciente: string; acao: string; prazo: string; responsavel: string }[], nome: (n: string) => string = (n) => n): string[] {
  const r = resumirComercial(regs, semMovimentacao);
  const l: string[] = ["*Conferência comercial — Mel*"];
  if (!regs.length) {
    l.push(semMovimentacao ? "• Sem movimentação comercial identificada (conferido pela Gabi)." : "• Conferência ainda não registrada hoje.");
  } else {
    l.push(`• Novos leads: ${r.novosLeads} (${r.leadsAtendidos} atendidos, ${r.leadsSemAtendimento} sem atendimento) · Follow-ups: ${r.followups} (${r.comResposta} com resposta, ${r.semResposta} sem) · Avaliações agendadas: ${r.agendadas} · Oportunidades pendentes: ${r.oportunidades} · Divergências: ${r.divergencias}`);
    l.push(`• ${r.pacientesUnicas} paciente${r.pacientesUnicas === 1 ? "" : "s"} · ${r.verificados} conferido${r.verificados === 1 ? "" : "s"} pela Gabi · ${r.naoVerificados} sem verificação`);
    for (const [k, titulo] of [["novo_lead", "NOVOS LEADS"], ["follow_up", "FOLLOW-UPS"], ["agendamento", "AGENDAMENTOS"], ["oportunidade", "OPORTUNIDADES PENDENTES"], ["divergencia", "DIVERGÊNCIAS"], ["outro", "OUTRAS MOVIMENTAÇÕES"]] as const) {
      const lista = regs.filter((x) => x.detalhes.grupo === k);
      if (!lista.length) continue;
      l.push(titulo);
      for (const x of lista) l.push(`• ${linhaComercial(x, nome)}`);
    }
    // Divergência apontada em outro grupo também aparece na lista de divergências.
    const extras = regs.filter((x) => x.detalhes.grupo !== "divergencia" && x.detalhes.conferencia === "divergencia");
    if (extras.length && !regs.some((x) => x.detalhes.grupo === "divergencia")) l.push("DIVERGÊNCIAS");
    for (const x of extras) l.push(`• ${nome(x.paciente)} — ${x.detalhes.divergencia ? rotuloDivergencia(x.detalhes.divergencia) : "divergência"}: ${x.detalhes.resultado_conferencia ?? ""}`);
  }
  if (pendentesAbertas.length) {
    l.push("PENDÊNCIAS COMERCIAIS EM ABERTO");
    for (const p of pendentesAbertas) l.push(`• ${nome(p.paciente)} — ${p.responsavel}: ${p.acao} (até ${dataBr(p.prazo)})`);
  }
  return l;
}

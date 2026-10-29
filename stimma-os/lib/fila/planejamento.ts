import type { EventoRow } from "./store";
import type { EntradaRegistro } from "./registro";
import type { ItemFila } from "./agrupamento";

/**
 * Planejamento anual — apresentação, aceitação e fechamento, presencial ou pelo WhatsApp.
 *
 * Não é um módulo comercial à parte: cada informação é um registro do dia comum (presencial na atividade
 * "Cada atendimento do dia teve um destino definido"; WhatsApp dentro da conferência comercial da Mel),
 * com os campos abaixo em `detalhes`. A OPORTUNIDADE é um identificador (`oportunidade_id`) resolvido no
 * servidor: a mesma paciente com o mesmo planejamento em aberto reaproveita a oportunidade, seja qual for
 * o canal — apresentação presencial seguida de follow-up da Mel pelo WhatsApp é UMA oportunidade, com
 * vários registros. O acompanhamento aberto usa a chave `planejamento:<id>` (regra de retorno existente):
 * nunca nasce outro para a mesma oportunidade; fechamento confirmado ou recusa encerram.
 *
 * Estados (não se confundem): apresentado → em avaliação/interesse → aceito (não é fechamento) → fechado
 * (só conta conferido em fonte oficial) | não fechado. Valor contratado nunca entra nos recebimentos.
 */
export const RESPOSTAS_PLANEJAMENTO = [
  ["sim", "Sim"],
  ["nao", "Não"],
  ["nao_confirmado", "Ainda não foi possível confirmar"],
  ["nao_se_aplica", "Não se aplica"],
] as const;
export type RespostaPlanejamento = (typeof RESPOSTAS_PLANEJAMENTO)[number][0];

export const RESULTADOS_PLANEJAMENTO = [
  ["avaliando", "Proposta apresentada — paciente avaliando"],
  ["interesse", "Paciente demonstrou interesse"],
  ["aceito", "Proposta aceita — aguardando formalização"],
  ["fechado", "Planejamento fechado"],
  ["sem_interesse", "Paciente não teve interesse no momento"],
] as const;
export type ResultadoPlanejamento = (typeof RESULTADOS_PLANEJAMENTO)[number][0];

export const MOTIVOS_NAO_APRESENTADO = [
  ["nao_indicacao", "Não houve indicação profissional"],
  ["ja_possui", "Paciente já possui planejamento"],
  ["pontual", "Atendimento pontual"],
  ["nao_abordada", "Oportunidade não abordada"],
  ["outro", "Outro motivo"],
  ["nao_informado", "Motivo ainda não informado"],
] as const;

/** Como a Gabi confirmou (presencial). No WhatsApp vale a forma de conferência da própria conferência comercial. */
export const CONFIRMACOES_PRESENCIAL = [
  ["profissional", "Confirmado com o profissional"],
  ["registros", "Conferido nos registros (Simples Dental)"],
  ["informado", "Informado, ainda não conferido"],
] as const;

export const CANAIS = [["presencial", "Presencial"], ["whatsapp", "WhatsApp"]] as const;
export type Canal = (typeof CANAIS)[number][0];

const rot = (lista: readonly (readonly [string, string])[], k?: string | null) => lista.find(([x]) => x === k)?.[1] ?? "";
export const rotuloResultadoPlan = (k?: string | null) => rot(RESULTADOS_PLANEJAMENTO, k);
export const rotuloMotivoNao = (k?: string | null) => rot(MOTIVOS_NAO_APRESENTADO, k);
export const rotuloCanal = (k?: string | null) => rot(CANAIS, k);
/** Rótulo curto da situação atual (para relatórios). */
export const SITUACAO_CURTA: Record<ResultadoPlanejamento, string> = {
  avaliando: "em avaliação", interesse: "demonstrou interesse", aceito: "aceito, aguardando formalização", fechado: "fechado", sem_interesse: "não fechado",
};

/** Resultados que deixam a oportunidade aberta e por isso exigem próxima ação, responsável e prazo. */
export const RESULTADOS_ABERTOS: readonly ResultadoPlanejamento[] = ["avaliando", "interesse", "aceito"];

export const ITEM_PRESENCIAL = "destino_atendimentos";
const t = (v?: string | null) => (v ?? "").trim();

/** Campos do planejamento como a tela os preenche. */
export interface EntradaPlanejamento {
  resposta: RespostaPlanejamento | "";
  resultado?: ResultadoPlanejamento | "";
  /** presencial: profissional responsável · WhatsApp: quem conduziu a conversa (padrão: Mel). */
  responsavel?: string;
  tipo?: string;
  data?: string;
  observacao?: string;
  /** presencial: profissional | registros | informado. */
  confirmacao?: string;
  motivoNao?: string;
  motivoRecusa?: string;
  naoContatar?: boolean;
  fechamento?: { data?: string; valor?: string; vendedor?: string; referencia?: string };
  /** É uma proposta diferente de outra já em aberto para a mesma paciente. */
  outra?: boolean;
  /** Esclarecimento com o profissional (quando não foi possível confirmar). */
  esclarecer?: string;
}

/** O fechamento foi conferido em fonte oficial (ou na conversa)? Só assim conta como fechamento. */
export function conferido(d: Record<string, string | undefined>): boolean {
  return ["profissional", "registros", "conversa", "simples_dental"].includes(d.planejamento_conferencia ?? "");
}

/** Precisa de próxima ação (responsável + prazo)? Oportunidade aberta, fechamento ainda não conferido ou situação a confirmar. */
export function precisaPendencia(p: Pick<EntradaPlanejamento, "resposta" | "resultado">, conferidoAgora: boolean): boolean {
  if (p.resposta === "nao_confirmado") return true;
  if (p.resposta !== "sim") return false;
  return RESULTADOS_ABERTOS.includes(p.resultado as ResultadoPlanejamento) || (p.resultado === "fechado" && !conferidoAgora);
}

const valorValido = (v: string) => /^[\d.,]+$/.test(v) && normalizarValor(v) !== null;

/** Validação junto do campo (o servidor confere de novo). `canal` define o que é obrigatório. */
export function validarPlanejamento(p: EntradaPlanejamento, canal: Canal, hoje: string): [string, string][] {
  const e: [string, string][] = [];
  if (!p.resposta) e.push(["planResposta", canal === "presencial" ? "Diga se foi apresentado um planejamento anual." : "Diga se houve apresentação de planejamento anual."]);
  if (p.resposta === "sim") {
    if (!p.resultado) e.push(["planResultado", "Escolha o resultado."]);
    if (canal === "presencial" && !t(p.responsavel)) e.push(["planResponsavel", "Informe o profissional responsável."]);
    if (canal === "presencial" && !p.confirmacao) e.push(["planConfirmacao", "Diga como você confirmou (não marque por presunção)."]);
    if (p.data && p.data > hoje) e.push(["planData", "A apresentação não pode estar no futuro."]);
    if (p.resultado === "fechado") {
      if (p.fechamento?.data && p.fechamento.data > hoje) e.push(["planFechData", "O fechamento não pode estar no futuro."]);
      if (t(p.fechamento?.valor) && !valorValido(t(p.fechamento?.valor))) e.push(["planValor", "Valor inválido (ex.: 4800 ou 4.800,00)."]);
    }
  }
  return e;
}

/** Normaliza "4.800,00" / "4800.5" para "4800.00". */
export function normalizarValor(v?: string): string | null {
  const s = t(v);
  if (!s) return null;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : null;
}

/** Monta os `detalhes` do planejamento para o registro do dia. */
export function detalhesPlanejamento(p: EntradaPlanejamento, canal: Canal, hoje: string, conferenciaWhatsapp?: string): Record<string, string> {
  const d: Record<string, string> = { planejamento: p.resposta, planejamento_canal: canal };
  if (p.resposta === "sim") {
    d.planejamento_resultado = p.resultado ?? "";
    d.planejamento_data = p.data || hoje;
    d.planejamento_conferencia = canal === "whatsapp" ? conferenciaWhatsapp ?? "" : p.confirmacao ?? "";
    if (t(p.responsavel)) d.planejamento_profissional = t(p.responsavel);
    if (t(p.tipo)) d.planejamento_tipo = t(p.tipo);
    if (t(p.observacao)) d.planejamento_obs = t(p.observacao);
    if (p.outra) d.planejamento_outra = "sim";
    if (p.resultado === "fechado") {
      d.planejamento_fechamento_data = p.fechamento?.data || hoje;
      const v = normalizarValor(p.fechamento?.valor);
      if (v) d.planejamento_valor = v;
      if (t(p.fechamento?.vendedor)) d.planejamento_vendedor = t(p.fechamento?.vendedor);
      if (t(p.fechamento?.referencia)) d.planejamento_ref = t(p.fechamento?.referencia);
    }
    if (p.resultado === "sem_interesse") {
      if (t(p.motivoRecusa)) d.planejamento_motivo_recusa = t(p.motivoRecusa);
      if (p.naoContatar) d.planejamento_nao_contatar = "sim";
    }
  }
  if (p.resposta === "nao" && p.motivoNao) d.planejamento_motivo_nao = p.motivoNao;
  if (p.resposta === "nao_confirmado" && t(p.esclarecer)) d.planejamento_esclarecer = t(p.esclarecer);
  return d;
}

// ---------------------------------------------------------------- servidor: oportunidade

const detalhesDe = (e: EventoRow) => (e.payload?.detalhes ?? {}) as Record<string, string | undefined>;
const norm = (s?: string) => t(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export interface Oportunidade {
  id: string;
  tipo: string;
  origem: Canal;
  ultimo: ResultadoPlanejamento;
  fechada: boolean;
  recusada: boolean;
  ultimaData: string;
}

/** Oportunidades de planejamento da paciente, a partir do histórico (mais recente primeiro). */
export function oportunidadesDoHistorico(eventos: EventoRow[]): Oportunidade[] {
  const porId = new Map<string, Oportunidade>();
  const ordenados = [...eventos].filter((e) => !e.payload?.anulado && detalhesDe(e).oportunidade_id)
    .sort((a, b) => `${a.occurredOn}${a.registradoEm ?? ""}`.localeCompare(`${b.occurredOn}${b.registradoEm ?? ""}`));
  for (const e of ordenados) {
    const d = detalhesDe(e);
    const id = d.oportunidade_id!;
    const o = porId.get(id) ?? { id, tipo: "", origem: (d.planejamento_origem ?? d.planejamento_canal ?? "presencial") as Canal, ultimo: "avaliando" as ResultadoPlanejamento, fechada: false, recusada: false, ultimaData: e.occurredOn };
    if (!o.tipo && d.planejamento_tipo) o.tipo = d.planejamento_tipo;
    if (d.planejamento_resultado) o.ultimo = d.planejamento_resultado as ResultadoPlanejamento;
    if (d.planejamento_fechou === "sim") o.fechada = true;
    o.recusada = o.ultimo === "sem_interesse";
    o.ultimaData = e.occurredOn;
    porId.set(id, o);
  }
  return [...porId.values()].reverse();
}

/**
 * Qual oportunidade este registro continua? Proposta "outra" → nova. Senão, a aberta da mesma paciente
 * (mesmo planejamento, quando o tipo foi informado; senão a mais recente). Fechamento informado de novo
 * para uma oportunidade já fechada reaproveita a fechada (não conta dois fechamentos).
 */
export function escolherOportunidade(ops: Oportunidade[], d: Record<string, string | undefined>): Oportunidade | null {
  if (d.planejamento_outra === "sim") return null;
  const mesmoTipo = (o: Oportunidade) => !d.planejamento_tipo || !o.tipo || norm(o.tipo) === norm(d.planejamento_tipo);
  const abertas = ops.filter((o) => !o.fechada && !o.recusada);
  const daMesma = abertas.find(mesmoTipo) ?? (d.planejamento_tipo ? null : abertas[0] ?? null);
  if (daMesma) return daMesma;
  if (d.planejamento_resultado === "fechado") return ops.find((o) => o.fechada && mesmoTipo(o)) ?? null;
  return null;
}

// ---------------------------------------------------------------- fechamento do dia

export interface RegistroPlanejamento {
  eventoId: string;
  pacienteId: string | null;
  paciente: string;
  detalhes: Record<string, string>;
  proxima: string | null;
  prazo: string | null;
  responsavelProxima: string | null;
}

export interface CarteiraPlanejamento {
  paciente: string;
  situacao: string;
  ultima: string;
  acao: string;
  responsavel: string;
  prazo: string;
}

export interface ResumoPlanejamento {
  atendimentosAgenda: number | null;
  atendimentosConferidos: number;
  apresentadosPresencial: number;
  apresentadosWhatsapp: number;
  oportunidades: number;
  aceitos: number;
  fechados: number;
  emAvaliacao: number;
  semFechamento: number;
  pendentesConferencia: number;
  followupsPendentes: number;
}

export const ehPlanejamento = (d: Record<string, unknown>) => typeof d.planejamento === "string" && d.planejamento !== "";
/** Registro que não é contato da Gabi (conferência da Mel, planejamento presencial): seção própria, fora dos blocos e indicadores dela. */
export const registroAuxiliar = (d: Record<string, unknown> | undefined) => !!d && (d.rotina_item === "conferencia_mel" || ehPlanejamento(d));
const pendenteDeConferencia = (d: Record<string, string>) =>
  d.planejamento === "nao_confirmado" || (d.planejamento === "sim" && (!conferido(d) || d.planejamento_conferencia === "divergencia"));

/** Carteira em aberto: acompanhamentos `planejamento:*` ainda não concluídos (acumulado, não só de hoje). */
export function carteiraPlanejamento(itens: ItemFila[]): CarteiraPlanejamento[] {
  return itens.filter((i) => i.retornoDe?.startsWith("planejamento:") && i.status !== "concluida").map((i) => ({
    paciente: i.pacienteNome,
    situacao: i.planejamento?.resultado ? SITUACAO_CURTA[i.planejamento.resultado as ResultadoPlanejamento] ?? "" : "",
    ultima: i.planejamento?.data ?? "",
    acao: i.proximaAcao ?? i.titulo,
    responsavel: !i.responsavel || i.responsavel === "Comercial Externa" ? "Mel (comercial)" : i.responsavel,
    prazo: i.due,
  }));
}

export function resumirPlanejamento(regs: RegistroPlanejamento[], carteira: CarteiraPlanejamento[], atendimentosAgenda: number | null): ResumoPlanejamento {
  const sim = regs.filter((r) => r.detalhes.planejamento === "sim");
  const novos = sim.filter((r) => r.detalhes.planejamento_novo === "sim");
  // Situação de cada oportunidade ao fim do dia = último registro dela hoje.
  const ultimoPorOp = new Map<string, RegistroPlanejamento>();
  for (const r of sim) ultimoPorOp.set(r.detalhes.oportunidade_id ?? r.eventoId, r);
  const finais = [...ultimoPorOp.values()];
  return {
    atendimentosAgenda,
    atendimentosConferidos: new Set(regs.filter((r) => r.detalhes.planejamento_canal === "presencial").map((r) => r.pacienteId ?? r.paciente)).size,
    apresentadosPresencial: novos.filter((r) => r.detalhes.planejamento_canal === "presencial").length,
    apresentadosWhatsapp: novos.filter((r) => r.detalhes.planejamento_canal === "whatsapp").length,
    oportunidades: new Set(novos.map((r) => r.detalhes.oportunidade_id ?? r.eventoId)).size,
    aceitos: finais.filter((r) => r.detalhes.planejamento_resultado === "aceito").length,
    fechados: sim.filter((r) => r.detalhes.planejamento_fechou === "sim").length,
    emAvaliacao: carteira.filter((c) => c.situacao !== "aceito, aguardando formalização").length,
    semFechamento: finais.filter((r) => r.detalhes.planejamento_resultado === "sem_interesse").length,
    pendentesConferencia: regs.filter((r) => pendenteDeConferencia(r.detalhes)).length,
    followupsPendentes: carteira.length,
  };
}

const dataBr = (iso?: string | null) => (iso ? iso.split("-").reverse().join("/") : "");
const reais = (v?: string) => (v ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "");

/** Grupos nominais do relatório (mesmo conteúdo na tela e no texto). */
export function gruposPlanejamento(regs: RegistroPlanejamento[], carteira: CarteiraPlanejamento[], nome: (n: string) => string = (n) => n) {
  const sim = regs.filter((r) => r.detalhes.planejamento === "sim");
  const situacao = (r: RegistroPlanejamento) => {
    const d = r.detalhes;
    if (d.planejamento_resultado === "fechado" && !conferido(d)) return "fechamento informado, aguardando conferência";
    return SITUACAO_CURTA[d.planejamento_resultado as ResultadoPlanejamento] ?? "";
  };
  const novos = (canal: Canal) => sim.filter((r) => r.detalhes.planejamento_novo === "sim" && r.detalhes.planejamento_canal === canal);
  // Situação ATUAL da oportunidade = último registro dela no dia (apresentada de manhã e fechada à tarde: fechado).
  const ultimo = new Map<string, RegistroPlanejamento>();
  for (const r of sim) ultimo.set(r.detalhes.oportunidade_id ?? r.eventoId, r);
  const atual = (r: RegistroPlanejamento) => situacao(ultimo.get(r.detalhes.oportunidade_id ?? r.eventoId) ?? r);
  return {
    presencial: novos("presencial").map((r) => `${nome(r.paciente)} — ${r.detalhes.planejamento_profissional ?? "profissional não informado"} — ${atual(r)}`),
    whatsapp: novos("whatsapp").map((r) => `${nome(r.paciente)} — ${r.detalhes.planejamento_profissional ?? "Mel"} — ${atual(r)}`),
    fechamentos: sim.filter((r) => r.detalhes.planejamento_fechou === "sim").map((r) => {
      const d = r.detalhes;
      const cont = d.planejamento_canal !== d.planejamento_origem ? ` (continuidade: ${rotuloCanal(d.planejamento_canal)})` : "";
      return `${nome(r.paciente)} — origem: ${rotuloCanal(d.planejamento_origem)}${cont}${d.planejamento_valor ? ` — ${reais(d.planejamento_valor)}` : " — valor não confirmado"}`;
    }),
    emAvaliacao: carteira.map((c) => `${nome(c.paciente)} — ${c.situacao || "em aberto"}${c.ultima ? ` (última movimentação ${dataBr(c.ultima)})` : ""} — próxima ação: ${c.acao} — ${c.responsavel} — ${dataBr(c.prazo)}`),
    naoFechados: sim.filter((r) => r.detalhes.planejamento_resultado === "sem_interesse").map((r) =>
      `${nome(r.paciente)} — ${r.detalhes.planejamento_motivo_recusa ?? "motivo não informado"}${r.detalhes.planejamento_nao_contatar === "sim" ? " (pediu para não receber novos contatos)" : ""}`),
    pendentes: regs.filter((r) => pendenteDeConferencia(r.detalhes)).map((r) => {
      const d = r.detalhes;
      const o = d.planejamento === "nao_confirmado" ? `confirmar se o planejamento foi apresentado${d.planejamento_esclarecer ? ` (${d.planejamento_esclarecer})` : ""}`
        : d.planejamento_conferencia === "divergencia" ? "divergência a esclarecer"
        : d.planejamento_resultado === "fechado" ? "conferir o fechamento em fonte oficial" : "conferir a apresentação (informada, não verificada)";
      return `${nome(r.paciente)} — ${o}`;
    }),
  };
}

export function textoPlanejamento(regs: RegistroPlanejamento[], carteira: CarteiraPlanejamento[], atendimentosAgenda: number | null, nome: (n: string) => string): string[] {
  const r = resumirPlanejamento(regs, carteira, atendimentosAgenda);
  const g = gruposPlanejamento(regs, carteira, nome);
  const l = ["*Planejamentos anuais — Apresentações e fechamentos*"];
  l.push(`• Hoje: atendimentos ${r.atendimentosAgenda ?? "—"} (conferidos quanto ao planejamento: ${r.atendimentosConferidos}) · apresentados presencialmente: ${r.apresentadosPresencial} · pelo WhatsApp: ${r.apresentadosWhatsapp} · oportunidades distintas: ${r.oportunidades}`);
  l.push(`• Aceitos (sem fechamento ainda): ${r.aceitos} · fechados (conferidos): ${r.fechados} · sem fechamento: ${r.semFechamento} · pendentes de conferência: ${r.pendentesConferencia}`);
  l.push(`• Carteira em aberto: ${r.followupsPendentes} proposta${r.followupsPendentes === 1 ? "" : "s"} com follow-up programado`);
  const bloco = (titulo: string, itens: string[]) => { if (itens.length) l.push(titulo, ...itens.map((x) => `• ${x}`)); };
  bloco("APRESENTADOS PRESENCIALMENTE", g.presencial);
  bloco("APRESENTADOS PELO WHATSAPP", g.whatsapp);
  bloco("FECHAMENTOS DO DIA", g.fechamentos);
  bloco("EM AVALIAÇÃO (carteira)", g.emAvaliacao);
  bloco("NÃO FECHADOS", g.naoFechados);
  bloco("INFORMAÇÕES PENDENTES", g.pendentes);
  if (!regs.length && !carteira.length) l.push("• Nenhum planejamento registrado hoje.");
  return l;
}

// ---------------------------------------------------------------- presencial (atividade de destino dos atendimentos)

export const RESPONSAVEIS_PLANEJAMENTO = [
  ["comercial_externa", "Mel (comercial)"],
  ["gabi", "Gabi"],
  ["dra_larissa", "Dra. Larissa"],
  ["gestao", "Gestão"],
] as const;
export type ResponsavelPlanejamento = (typeof RESPONSAVEIS_PLANEJAMENTO)[number][0];

export interface EntradaPresencial {
  eventoId: string;
  pacienteId?: string | null;
  nomeNovo?: string;
  plan: EntradaPlanejamento;
  pendencia?: { responsavel: ResponsavelPlanejamento; acao: string; prazo: string } | null;
}

export function validarPresencial(e: Omit<EntradaPresencial, "eventoId">, hoje: string): [string, string][] {
  const erros: [string, string][] = [];
  if (!e.pacienteId && !t(e.nomeNovo)) erros.push(["paciente", "Informe a paciente."]);
  erros.push(...validarPlanejamento(e.plan, "presencial", hoje));
  if (precisaPendencia(e.plan, ["profissional", "registros"].includes(e.plan.confirmacao ?? ""))) {
    if (!e.pendencia || !t(e.pendencia.acao)) erros.push(["acao", "Escreva a próxima ação."]);
    if (!e.pendencia?.prazo || e.pendencia.prazo < hoje) erros.push(["prazo", "Escolha a data (hoje ou depois)."]);
  }
  return erros;
}

/** Ação sugerida quando a proposta fica aberta (a Gabi pode reescrever). */
export function acaoSugerida(p: EntradaPlanejamento): string {
  if (p.resposta === "nao_confirmado") return `Confirmar com ${t(p.responsavel) || "o profissional"} se o planejamento anual foi apresentado`;
  if (p.resultado === "fechado") return "Conferir o fechamento do planejamento no Simples Dental";
  if (p.resultado === "aceito") return "Acompanhar a formalização do planejamento";
  return "Retomar contato sobre o planejamento anual";
}

export function registroPresencial(e: EntradaPresencial, usuarioId: string, hoje: string): Omit<EntradaRegistro, "data"> {
  const detalhes = { rotina_item: ITEM_PRESENCIAL, acao: "Planejamento anual — atendimento presencial", ...detalhesPlanejamento(e.plan, "presencial", hoje) };
  const p = precisaPendencia(e.plan, ["profissional", "registros"].includes(e.plan.confirmacao ?? "")) ? e.pendencia : null;
  const resumo = e.plan.resposta === "sim" ? `Planejamento anual apresentado: ${rotuloResultadoPlan(e.plan.resultado)}`
    : e.plan.resposta === "nao" ? `Planejamento anual não apresentado${e.plan.motivoNao ? ` (${rotuloMotivoNao(e.plan.motivoNao).toLowerCase()})` : ""}`
    : e.plan.resposta === "nao_confirmado" ? "Planejamento anual: ainda não foi possível confirmar" : "Planejamento anual: não se aplica a este atendimento";
  return {
    eventoId: e.eventoId, alvos: [], categoria: "oportunidade",
    pacienteId: e.pacienteId || null, novoPaciente: !e.pacienteId && t(e.nomeNovo) ? { nome: t(e.nomeNovo) } : undefined,
    contexto: "Planejamento anual", contato: null, resposta: null, feito: resumo,
    situacao: p ? "pendente" : "informativo",
    ...(p ? { proximaAcao: t(p.acao), prazo: p.prazo, responsavel: p.responsavel === "gabi" ? `perfil:${usuarioId}` : p.responsavel } : {}),
    detalhes,
  };
}

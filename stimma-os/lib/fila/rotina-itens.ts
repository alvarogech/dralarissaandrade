import type { Categoria, RotinaItemRow } from "./store";

/**
 * Catálogo e resumo da rotina diária da concierge (puro, sem acesso a dados — usado também na
 * interface). Regras de gravação e permissão ficam em rotina.ts.
 *
 * Itens fixos aparecem todo dia; itens com `agenda` só no dia correspondente (dia da semana em
 * America/Sao_Paulo ou dia do mês). Missões recorrentes (cobranças, aniversários, contatos de
 * 15/30/90 dias, resgate, pré-confirmação) NUNCA viram tarefa por paciente: registram só estado
 * e quantidades — os dados das pacientes continuam no Simples Dental e nos fluxos próprios.
 */
/**
 * Grupos da rotina, na ordem da tela. "Prioridades de hoje" e "Solicitações da gestão" não têm
 * itens fixos: são preenchidos com o que veio do dia anterior e com as tarefas atribuídas.
 */
export const GRUPOS_ROTINA = [
  { id: "prioridades", titulo: "Prioridades de hoje" },
  { id: "inicio", titulo: "Início do dia" },
  { id: "relacionamento", titulo: "Relacionamento com pacientes" },
  { id: "financeiro", titulo: "Financeiro" },
  { id: "gestao", titulo: "Solicitações da gestão" },
  { id: "finais", titulo: "Conferências finais" },
] as const;
export type GrupoRotina = (typeof GRUPOS_ROTINA)[number]["id"];

/** Quantidade registrada num item (sem nomes, telefones nem valores). */
export interface MetricaRotina {
  key: string;
  rotulo: string;
  /** numero = quantidade inteira; sim_nao = marcação (ex.: precisa de orientação da gestão). */
  tipo: "numero" | "sim_nao";
  /** Meta do dia (só exibição; não bloqueia nada). */
  meta?: number;
}

/** Quando o item aparece. Sem agenda = todo dia. */
export interface AgendaItem {
  /** 0 = domingo … 6 = sábado. */
  diasDaSemana?: number[];
  diaDoMes?: number;
  /** Rótulo curto exibido no item ("Segundas e sextas", "Dia 20"). */
  rotulo: string;
}

/** Resultado rápido de um contato com paciente (cada atividade oferece os que fazem sentido). */
export type ResultadoContato =
  | "contato_realizado" | "mensagem_enviada" | "aguardando_resposta" | "nao_respondeu" | "agendou" | "encaminhado_comercial"
  | "resolvido" | "nova_acao" | "pagamento_confirmado" | "promessa_pagamento" | "negociacao" | "encaminhado_gestao";

/**
 * Atividade com pacientes (tipo B): "Feito" só vale com ao menos uma paciente registrada; cada
 * paciente vira um registro do dia (histórico, próxima ação e feedback, sem redigitar).
 */
export interface PacientesDoItem {
  categoria: Categoria;
  /** Ação realizada, já definida pelo contexto da atividade. */
  acao: string;
  resultados: readonly ResultadoContato[];
  /** Marco de acompanhamento (evita repetir o mesmo marco para a mesma paciente sem motivo). */
  marco?: "15 dias" | "30 dias" | "60 dias" | "90 dias";
  cobranca?: boolean;
  /** Meta de pacientes do dia (só exibição). */
  meta?: number;
}

export interface ItemRotina {
  key: string;
  grupo: GrupoRotina;
  texto: string;
  /** Nome curto (itens do dia: resumo no topo da rotina). */
  curto?: string;
  /** Orientação curta (o que conferir), sem dados de paciente. */
  dica?: string;
  agenda?: AgendaItem;
  metricas?: readonly MetricaRotina[];
  /** Link configurável no servidor (sem link configurado, nada é exibido — nunca se inventa URL). */
  link?: { config: ChaveLinkRotina; rotulo: string };
  /** Atividade com pacientes (tipo B). Sem isto, é conferência operacional simples (tipo A). */
  pacientes?: PacientesDoItem;
}

export const CHAVES_LINK_ROTINA = ["script_aniversario"] as const;
export type ChaveLinkRotina = (typeof CHAVES_LINK_ROTINA)[number];
export const ROTULO_LINK_ROTINA: Record<ChaveLinkRotina, string> = { script_aniversario: "Script aprovado de aniversário" };

/** Só links http(s) configurados pela gestão; qualquer outra coisa é ignorada (nunca se inventa URL). */
export function linkSeguro(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}


const PRECISA_CONFERIR: MetricaRotina = { key: "precisa_conferir", rotulo: "Precisa conferir (dados insuficientes)", tipo: "numero" };

/** Resultados rápidos de contato com paciente, por tipo de atividade (ver contato-rotina.ts). */
const CONTATO: readonly ResultadoContato[] = ["contato_realizado", "aguardando_resposta", "nao_respondeu", "agendou", "encaminhado_comercial", "resolvido", "nova_acao"];

/*
 * Reorganização de 27/10 (prestação de contas): grupos por assunto em vez de horário; itens que
 * repetiam outro lugar saíram do checklist — follow-ups do dia (agora em "Prioridades de hoje"),
 * informar a gestão (é o "Pedir orientação" da pendência), retornos agendados e encaminhamentos
 * feitos (viram registros de paciente) e as três conferências de pagamento (uma só + conferência de
 * recebimentos). As chaves que continuam são as mesmas: o histórico gravado não muda de sentido.
 */
export const ITENS_ROTINA: readonly ItemRotina[] = [
  { key: "agenda_hoje_amanha", grupo: "inicio", texto: "Conferir a agenda de hoje e de amanhã", dica: "No Simples Dental; o STIMMA OS só mostra a agenda sincronizada." },
  { key: "novos_atendimentos", grupo: "inicio", texto: "Conferir novos atendimentos, retornos e procedimentos do dia" },
  { key: "cadastro_documentos", grupo: "inicio", texto: "Verificar pendências de cadastro e documentos", dica: "Registre só a conferência ou a pendência; documentos ficam no Simples Dental." },
  { key: "preparacao_equipe", grupo: "inicio", texto: "Confirmar a preparação da recepção, da equipe e dos ambientes" },
  {
    key: "aniversariantes", grupo: "inicio", curto: "Aniversariantes", texto: "Verificar as aniversariantes do dia e enviar a mensagem pelo script aprovado.",
    dica: "Consulta e envio no Simples Dental e no WhatsApp da clínica. Registre aqui quem recebeu a mensagem.",
    pacientes: { categoria: "relacionamento", acao: "Mensagem de aniversário", resultados: ["mensagem_enviada", "contato_realizado", "nao_respondeu"] },
    metricas: [PRECISA_CONFERIR],
    link: { config: "script_aniversario", rotulo: "Abrir script aprovado" },
  },

  {
    key: "pos_procedimento_ontem", grupo: "relacionamento", curto: "Pós-procedimento", texto: "Pós-procedimento — pacientes de ontem",
    dica: "Confira no Simples Dental as pacientes que realizaram procedimentos no dia anterior. Realize os acompanhamentos necessários e registre os contatos.",
    pacientes: { categoria: "pos_atendimento", acao: "Contato de pós-procedimento", resultados: CONTATO },
  },
  {
    key: "contatos_15_dias", grupo: "relacionamento", curto: "Contatos de 15 dias", texto: "Contatos de 15 dias após o retorno",
    dica: "Confira no Simples Dental as pacientes cujo retorno foi há 15 dias (conte a partir da data do retorno) e registre os contatos.",
    agenda: { diasDaSemana: [1], rotulo: "Segunda-feira" },
    pacientes: { categoria: "recorrencia", acao: "Contato de 15 dias", resultados: CONTATO, marco: "15 dias" },
    metricas: [PRECISA_CONFERIR],
  },
  {
    key: "contatos_30_dias", grupo: "relacionamento", curto: "Contatos de 30 dias", texto: "Acompanhamentos de 30 dias",
    dica: "Confira no Simples Dental as pacientes previstas para hoje (30 dias do retorno/atendimento de referência) e registre os contatos realizados.",
    agenda: { diasDaSemana: [2], rotulo: "Terça-feira" },
    pacientes: { categoria: "recorrencia", acao: "Acompanhamento de 30 dias", resultados: CONTATO, marco: "30 dias" },
    metricas: [PRECISA_CONFERIR],
  },
  {
    key: "contatos_60_dias", grupo: "relacionamento", curto: "Contatos de 60 dias", texto: "Acompanhamentos de 60 dias",
    dica: "Confira no Simples Dental as pacientes previstas para hoje (60 dias do retorno/atendimento de referência) e registre os contatos realizados.",
    agenda: { diasDaSemana: [4], rotulo: "Quinta-feira" },
    pacientes: { categoria: "recorrencia", acao: "Acompanhamento de 60 dias", resultados: CONTATO, marco: "60 dias" },
    metricas: [PRECISA_CONFERIR],
  },
  {
    key: "contatos_90_dias", grupo: "relacionamento", curto: "Contatos de 90 dias", texto: "Acompanhamentos de 90 dias",
    dica: "Confira no Simples Dental as pacientes previstas para hoje (90 dias do retorno/atendimento de referência) e registre os contatos realizados.",
    agenda: { diasDaSemana: [3], rotulo: "Quarta-feira" },
    pacientes: { categoria: "recorrencia", acao: "Acompanhamento de 90 dias", resultados: CONTATO, marco: "90 dias" },
    metricas: [PRECISA_CONFERIR],
  },
  {
    key: "resgate_10_meses", grupo: "relacionamento", curto: "Resgate de pacientes (meta 10)", texto: "Resgate de pacientes sem atendimento há mais de 10 meses — meta: 10 pacientes",
    dica: "Lista no Simples Dental. Registre cada paciente trabalhada; elegibilidade incerta vai em “precisa conferir”.",
    agenda: { diasDaSemana: [4], rotulo: "Quinta-feira" },
    pacientes: { categoria: "recorrencia", acao: "Resgate de paciente", resultados: CONTATO, meta: 10 },
    metricas: [PRECISA_CONFERIR],
  },
  {
    key: "acompanhar_agenda", grupo: "relacionamento", curto: "Remarcações e faltas", texto: "Acompanhar atrasos, encaixes, cancelamentos, remarcações e faltas",
    dica: "Registre cada paciente com quem falou sobre remarcação, falta ou cancelamento.",
    pacientes: { categoria: "agenda", acao: "Remarcação / falta", resultados: ["agendou", "aguardando_resposta", "nao_respondeu", "resolvido", "nova_acao"] },
  },
  {
    key: "pos_procedimento", grupo: "relacionamento", curto: "Continuidade de tratamentos", texto: "Acompanhar a continuidade dos planos de tratamento",
    pacientes: { categoria: "continuidade", acao: "Continuidade de tratamento", resultados: CONTATO },
  },
  {
    key: "encaminhar_comercial", grupo: "relacionamento", curto: "Encaminhamentos à comercial", texto: "Encaminhar à comercial externa as primeiras avaliações a recuperar",
    pacientes: { categoria: "encaminhamento", acao: "Encaminhamento à comercial externa", resultados: ["encaminhado_comercial"] },
  },
  {
    key: "pre_confirmacao_mes_seguinte", grupo: "relacionamento", curto: "Pré-confirmação do mês seguinte", texto: "Pré-confirmação da agenda do mês seguinte",
    dica: "Pré-confirme no Simples Dental; nada é confirmado ou remarcado pelo STIMMA OS.",
    agenda: { diaDoMes: 20, rotulo: "Dia 20" },
    metricas: [{ key: "pre_confirmadas", rotulo: "Pacientes pré-confirmadas", tipo: "numero" }, PRECISA_CONFERIR],
  },

  { key: "recebimentos_lancamentos", grupo: "financeiro", texto: "Conferir recebimentos e lançamentos do dia no Simples Dental", dica: "Registre os totais na conferência de recebimentos logo abaixo. Nada de dados bancários ou de cartão." },
  { key: "condicoes_pagamento", grupo: "financeiro", texto: "Consultar condições de pagamento autorizadas pela gestão", dica: "Só use condições explicitamente autorizadas." },
  {
    key: "cobrancas_simples_dental", grupo: "financeiro", curto: "Cobranças de inadimplentes", texto: "Conferir inadimplentes no Simples Dental e realizar as cobranças autorizadas.",
    dica: "Registre cada paciente cobrada e o resultado. Promessa de pagamento não é recebimento. Nada é cobrado automaticamente.",
    agenda: { diasDaSemana: [1, 5], rotulo: "Segundas e sextas" },
    pacientes: { categoria: "pendencia", acao: "Cobrança", resultados: ["pagamento_confirmado", "promessa_pagamento", "aguardando_resposta", "nao_respondeu", "negociacao", "encaminhado_gestao"], cobranca: true },
    metricas: [{ key: "pendencias_revisadas", rotulo: "Pendências revisadas", tipo: "numero" }, { key: "orientacao_gestao", rotulo: "Precisa de orientação da gestão", tipo: "sim_nao" }],
  },

  { key: "destino_atendimentos", grupo: "finais", texto: "Cada atendimento do dia teve um destino definido" },
  { key: "registros_crm", grupo: "finais", texto: "Registros administrativos e CRM atualizados" },
  { key: "faltas_registradas", grupo: "finais", texto: "Faltas e cancelamentos registrados" },
  { key: "pendencias_continuam", grupo: "finais", texto: "Atividades que exigem continuidade conferidas", dica: "O que continua aberto volta sozinho na data combinada." },
  { key: "agenda_amanha", grupo: "finais", texto: "Agenda do dia seguinte preparada" },
];

/** Dia da semana (0 = domingo) de uma data AAAA-MM-DD — sem fuso (a data já é a local da clínica). */
export function diaDaSemana(dia: string): number {
  const [y, m, d] = dia.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d).getDay();
}

export function itemValeNoDia(i: ItemRotina, dia: string): boolean {
  if (!i.agenda) return true;
  if (i.agenda.diaDoMes !== undefined && Number(dia.slice(8, 10)) !== i.agenda.diaDoMes) return false;
  if (i.agenda.diasDaSemana && !i.agenda.diasDaSemana.includes(diaDaSemana(dia))) return false;
  return true;
}

/** Itens da rotina daquele dia (fixos + os da agenda semanal/mensal que caem nele). */
export function itensDoDia(dia: string): ItemRotina[] {
  return ITENS_ROTINA.filter((i) => itemValeNoDia(i, dia));
}

export const ESTADOS_ROTINA = ["a_fazer", "feito", "nao_se_aplica", "impedimento"] as const;
export type EstadoRotina = (typeof ESTADOS_ROTINA)[number];
export const ROTULO_ESTADO_ROTINA: Record<EstadoRotina, string> = { a_fazer: "A fazer", feito: "Feito", nao_se_aplica: "Não se aplica", impedimento: "Com impedimento" };

export const textoDoItem = (key: string) => ITENS_ROTINA.find((i) => i.key === key)?.texto ?? key;
export const itemDaRotina = (key: string) => ITENS_ROTINA.find((i) => i.key === key);

export type ValorMetrica = number | boolean;
export type MetricasRotina = Record<string, ValorMetrica>;

export const MAX_QUANTIDADE = 999;

/**
 * Valida as quantidades enviadas para um item: só as chaves do catálogo daquele item, inteiros de
 * 0 a 999 ou sim/não. Campo vazio/ausente = não informado (nunca vira zero presumido).
 */
export function normalizarMetricas(item: ItemRotina, bruto: unknown): { ok: true; metricas: MetricasRotina } | { ok: false; erro: string } {
  if (bruto === undefined || bruto === null) return { ok: true, metricas: {} };
  if (typeof bruto !== "object" || Array.isArray(bruto)) return { ok: false, erro: "Quantidades inválidas." };
  const defs = item.metricas ?? [];
  const m: MetricasRotina = {};
  for (const [k, v] of Object.entries(bruto as Record<string, unknown>)) {
    const d = defs.find((x) => x.key === k);
    if (!d) return { ok: false, erro: `Quantidade não prevista para este item: ${k}.` };
    if (v === null || v === undefined || v === "") continue;
    if (d.tipo === "sim_nao") {
      if (typeof v !== "boolean") return { ok: false, erro: `${d.rotulo}: marque sim ou não.` };
      if (v) m[k] = true;
      continue;
    }
    if (!(typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_QUANTIDADE)) return { ok: false, erro: `${d.rotulo}: informe um número inteiro de 0 a ${MAX_QUANTIDADE}.` };
    m[k] = v;
  }
  return { ok: true, metricas: m };
}

/** Texto curto das quantidades de um item ("12 pendências revisadas · 5 cobranças efetuadas"). */
export function textoMetricas(item: ItemRotina, m: MetricasRotina | null | undefined): string {
  if (!item.metricas || !m) return "";
  return item.metricas
    .map((d) => {
      const v = m[d.key];
      if (d.tipo === "sim_nao") return v === true ? d.rotulo.toLowerCase() : "";
      if (typeof v !== "number") return "";
      return `${d.rotulo}: ${v}${d.meta ? ` (meta ${d.meta})` : ""}`;
    })
    .filter(Boolean)
    .join(" · ");
}

/** Resumo da rotina para o feedback (só quando algo foi registrado no dia). */
export interface ResumoRotina {
  registrada: boolean;
  feitos: string[];
  naoSeAplica: string[];
  pendentes: string[];
  impedimentos: { item: string; motivo: string; proxima: string; responsavel: string | null; prazo: string | null }[];
  /** Quantidades registradas (sem dados de paciente), por item, na ordem do catálogo. */
  quantidades: { item: string; texto: string; atencao: boolean }[];
  /** Assinatura dos estados: detecta mudança depois de gerar o feedback. */
  assinatura: string;
}

export function resumirRotina(linhas: RotinaItemRow[], dia: string, rotuloResponsavel: (r: string | null) => string | null = (r) => r): ResumoRotina {
  const itens = itensDoDia(dia);
  const por = new Map(linhas.map((l) => [l.itemKey, l]));
  const estado = (k: string): EstadoRotina => por.get(k)?.estado ?? "a_fazer";
  const sel = (e: EstadoRotina) => itens.filter((i) => estado(i.key) === e).map((i) => i.texto);
  const metricas = (k: string): MetricasRotina => por.get(k)?.metricas ?? {};
  return {
    registrada: itens.some((i) => estado(i.key) !== "a_fazer" || Object.keys(metricas(i.key)).length > 0),
    feitos: sel("feito"),
    naoSeAplica: sel("nao_se_aplica"),
    pendentes: sel("a_fazer"),
    impedimentos: itens.filter((i) => estado(i.key) === "impedimento").map((i) => {
      const l = por.get(i.key)!;
      return { item: i.texto, motivo: l.motivo ?? "", proxima: l.proximaAcao ?? "", responsavel: rotuloResponsavel(l.responsavel), prazo: l.prazo };
    }),
    quantidades: itens
      .map((i) => ({ item: i.curto ?? i.texto, texto: textoMetricas(i, metricas(i.key)), atencao: metricas(i.key).orientacao_gestao === true || Number(metricas(i.key).precisa_conferir ?? 0) > 0 }))
      .filter((q) => q.texto),
    assinatura: itens.map((i) => {
      const l = por.get(i.key);
      const m = metricas(i.key);
      const mt = Object.keys(m).sort().map((k) => `${k}=${String(m[k])}`).join(",");
      return `${i.key}:${estado(i.key)}${l?.estado === "impedimento" ? `:${l.motivo}|${l.proximaAcao}|${l.prazo ?? ""}|${l.responsavel ?? ""}` : ""}${mt ? `#${mt}` : ""}`;
    }).join(";"),
  };
}

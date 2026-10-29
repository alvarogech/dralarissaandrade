import type { PacienteRef } from "./contrato";
import type { NormalizedAppointment } from "@/lib/sync/types";
import type { TipoMarco } from "./marcos";
import type { AtendimentoExistente, Classificacao, PacienteConhecido, RegistroExistente } from "./previa";

/**
 * Acesso a dados da fila. Duas implementações: Supabase (produção, via service role nos Route
 * Handlers) e memória (testes e modo demonstração — nunca se cria dado de teste no banco real).
 * A regra de negócio fica em servico.ts; aqui só leitura/escrita.
 */
export type StatusMarcoDb = "previsto" | "contatado" | "contemplado" | "dispensado" | "invalidado";
export type StatusTarefaDb = "open" | "in_progress" | "waiting" | "completed" | "cancelled";
export type TipoTarefa = "cobranca" | "recuperacao_falta" | "continuidade" | "relacionamento" | "encaminhamento" | "outro"
  | "agenda" | "oportunidade" | "recorrencia" | "pos_atendimento" | "pendencia";

/** Área do registro do dia (bloco do feedback). */
export const CATEGORIAS = ["agenda", "oportunidade", "recorrencia", "continuidade", "pos_atendimento", "relacionamento", "pendencia", "encaminhamento"] as const;
export type Categoria = (typeof CATEGORIAS)[number];
/** sim / não / não se aplica — null = não preenchido (nunca presumido). */
export type SimNao = "sim" | "nao" | "na";

export const TIPOS_EVENTO = ["contato", "resposta", "agendamento_obtido", "cancelamento", "recebimento_confirmado", "atendimento_realizado", "adiamento", "encerramento", "encaminhamento", "correcao", "registro", "nota"] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export interface AtendimentoRow {
  id: string;
  patientId: string;
  chaveOrigem: string | null;
  dataRealizada: string | null;
  dataStatus: "exata" | "pendente_validacao";
  realizadoConfirmado: boolean;
  anulado: boolean;
  createdAt: string;
}

export interface MarcoRow {
  id: string;
  appointmentId: string;
  patientId: string;
  kind: TipoMarco;
  dueOriginal: string;
  dueCurrent: string;
  status: StatusMarcoDb;
  statusReason: string | null;
  updatedAt: string;
  temEventoVinculado: boolean;
  /** Data exata do atendimento de referência. */
  dataAtendimento?: string | null;
}

export interface TarefaRow {
  id: string;
  /** null = assunto sem paciente (ex.: pendência administrativa). */
  patientId: string | null;
  assunto: string | null;
  kind: TipoTarefa;
  title: string;
  chaveOrigem: string | null;
  status: StatusTarefaDb;
  due: string;
  aConferir: string[];
  payload: Record<string, unknown>;
  financialImpact: number | null;
  closedReason: string | null;
  updatedAt: string;
  temEventoVinculado: boolean;
  assignedTo: string | null;
  nextAction: string | null;
  origem: string | null;
  /** Data da informação de origem (levantamento, registro, criação manual). */
  origemData?: string | null;
  /** Quem a tarefa está esperando quando status = waiting. */
  aguardando?: "paciente" | "gestao" | null;
  prioridade?: Prioridade | null;
  /** Prazo antes do primeiro adiamento (preservado). */
  prazoOriginal?: string | null;
  adiamentos?: number;
  criadoEm?: string;
}

export type Prioridade = "alta" | "normal" | "baixa";

/** Configuração da fila por organização (migration 0014). null = não configurado. */
export interface FilaConfig {
  conciergeId: string | null;
  conciergeNome: string | null;
  gestorId: string | null;
  /** 0 = domingo … 6 = sábado. */
  diasExpediente: number[] | null;
  /** "HH:MM" no fuso America/Sao_Paulo. */
  horarioFechamento: string | null;
  excecoes: string[];
  diasSemAtualizacao: number;
  /** Links configuráveis da rotina (ex.: script aprovado de aniversário). Sem link, nada é exibido (migration 0016). */
  linksRotina: Record<string, string>;
}

export const CONFIG_VAZIA: FilaConfig = { conciergeId: null, conciergeNome: null, gestorId: null, diasExpediente: null, horarioFechamento: null, excecoes: [], diasSemAtualizacao: 3, linksRotina: {} };

/** Versão do feedback diário: gerada (pronta para revisão) ou entregue à gestão. */
export interface FeedbackRow {
  id: string;
  dia: string;
  responsavel: string;
  versao: number;
  status: "gerado" | "entregue";
  texto: string;
  contadores: Record<string, unknown>;
  eventos: string[];
  substitui: string | null;
  geradoEm: string;
  entregueEm: string | null;
  copiadoEm: string | null;
  whatsappConfirmadoEm: string | null;
  observacaoGestao: string | null;
  ajusteSolicitadoEm: string | null;
  ajusteSolicitadoPor: string | null;
}

/** Item da rotina diária (migration 0015). Sem linha = "a fazer". */
export interface RotinaItemRow {
  userId: string;
  dia: string;
  itemKey: string;
  estado: "a_fazer" | "feito" | "nao_se_aplica" | "impedimento";
  motivo: string | null;
  proximaAcao: string | null;
  prazo: string | null;
  responsavel: string | null;
  tarefaId: string | null;
  /** Quantidades do item (sem nomes, telefones nem valores) — migration 0016. Vazio = nada registrado. */
  metricas: Record<string, number | boolean>;
  updatedBy: string;
  updatedAt: string;
}

/** Compromisso sincronizado do Simples Dental (somente leitura). */
export interface CompromissoAgenda {
  id: string;
  inicio: string;
  fim: string | null;
  status: "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show" | "rescheduled";
  paciente: string;
  profissional: string | null;
  motivo: string | null;
  /** Sincronizado sem identificador do Simples Dental: precisa conferência humana. */
  revisar: boolean;
  sincronizadoEm: string | null;
}

/** Estado persistido de um lote de entrada (para retomar sem duplicar). */
export interface LoteEstado {
  id: string;
  status: "em_andamento" | "confirmado" | "previa" | "descartado";
  criadoEm: string;
  itens: { index: number; resultado: string; aplicado: boolean; resolution: unknown; erro: string | null }[];
}

export interface EventoRow {
  id: string;
  patientId: string | null;
  assunto?: string | null;
  categoria?: Categoria | null;
  contato?: SimNao | null;
  resposta?: SimNao | null;
  resultado?: string | null;
  /** Situação do caso depois deste registro (aguardando, pendente, agendado, resolvido, informativo…). */
  situacao?: string | null;
  payload?: Record<string, unknown>;
  kind: TipoEvento;
  occurredOn: string;
  channel: string | null;
  notes: string | null;
  amount: number | null;
  amountOrigin: string | null;
  scheduledFor: string | null;
  createdBy: string;
  /** Quando foi gravado (autor e horário no histórico). */
  registradoEm?: string;
  alvos: { marcoId?: string; tarefaId?: string }[];
}

export interface NumerosDoDia {
  agendaPrevista: number | null;
  agendaRealizada: number | null;
  caixaPrevisto: number | null;
  caixaRecebido: number | null;
  caixaSituacao: string | null;
}

export interface PrioridadeDoDia {
  /** Referência curta do item ([T-…]/[M-…]) ou null para prioridade manual. */
  ref: string | null;
  texto: string;
  /** Campos da prioridade para o próximo dia útil (todos opcionais além do texto). */
  paciente?: string | null;
  data?: string | null;
  prioridade?: "alta" | "normal" | null;
  /** De onde veio: tarefa, contato, solicitação, impedimento, manual. */
  origem?: string | null;
  proxima?: string | null;
  /** Prioridade manual resolvida no dia seguinte (as ligadas a tarefa seguem o estado da tarefa). */
  resolvidaEm?: string | null;
  resolvidaPor?: string | null;
}

/** Rascunho do fechamento, salvo no servidor (não depende do navegador). */
export interface RascunhoFechamento {
  observacao?: string;
  /** Situações que exigem decisão da gestão. */
  decisoes?: string;
  /** A concierge revisou as prioridades do próximo dia útil (seção obrigatória do fechamento). */
  prioridadesConfirmadas?: boolean;
  salvoEm?: string;
}

export interface EstadoDoDia {
  prioridades: PrioridadeDoDia[];
  /** Seções revisadas e marcadas "sem ocorrências" (ausente = não revisada). */
  secoes: Partial<Record<Categoria, "sem_ocorrencias">>;
  rascunho?: RascunhoFechamento;
}

/**
 * Conferência de recebimentos do dia (totais conferidos no Simples Dental, fonte oficial). Sem
 * linha = conferência ainda não feita; "sem_recebimentos" = conferido e não houve recebimento.
 */
export interface ConferenciaCaixa {
  dia: string;
  situacao: "conferido" | "sem_recebimentos";
  previsto: number | null;
  recebido: number | null;
  justificativa: string | null;
  conferidoPor: string;
  conferidoEm: string;
}

export interface FilaStore {
  // leitura
  pacientes(): Promise<PacienteConhecido[]>;
  registrosPorChave(chaves: string[]): Promise<RegistroExistente[]>;
  atendimentosDe(pacienteIds: string[]): Promise<AtendimentoExistente[]>;
  loteExiste(hash: string): Promise<boolean>;
  atendimentoPorChave(chave: string): Promise<AtendimentoRow | null>;
  atendimento(id: string): Promise<AtendimentoRow | null>;
  atendimentosPendentes(): Promise<AtendimentoRow[]>;
  tarefaPorChave(chave: string): Promise<TarefaRow | null>;
  /** Tarefas abertas (a fazer ou aguardando) de uma paciente — para reprogramar o retorno em vez de duplicar. */
  tarefasAbertasDoPaciente(patientId: string): Promise<TarefaRow[]>;
  /** Abertos (previsto/contatado) + encerrados atualizados a partir de `desde` (AAAA-MM-DD). */
  marcosAtivos(desde: string): Promise<MarcoRow[]>;
  marco(id: string): Promise<MarcoRow | null>;
  tarefasAtivas(desde: string): Promise<TarefaRow[]>;
  tarefa(id: string): Promise<TarefaRow | null>;
  nomesPacientes(ids: string[]): Promise<Record<string, string>>;
  eventoExiste(id: string): Promise<boolean>;
  /** Eventos vinculados a um item, do mais antigo ao mais novo (histórico). */
  eventosDoAlvo(alvo: { marcoId?: string; tarefaId?: string }): Promise<EventoRow[]>;
  /** Ids de tarefas/marcos cujo id começa com o prefixo (referência curta do feedback). */
  resolverRef(tipo: "tarefa" | "marco", prefixo: string): Promise<string[]>;
  perfis(): Promise<{ id: string; nome: string }[]>;
  eventosDoDia(dia: string): Promise<EventoRow[]>;
  /** Registros de uma paciente a partir de uma data (contatos recentes, marco repetido). */
  eventosRecentesDoPaciente(patientId: string, desde: string): Promise<EventoRow[]>;
  conferenciaCaixa(dia: string): Promise<ConferenciaCaixa | null>;
  numerosDoDia(dia: string): Promise<NumerosDoDia | null>;
  estadoDoDia(dia: string): Promise<EstadoDoDia>;
  config(): Promise<FilaConfig>;
  /** Última leitura do histórico de cada tarefa pelo usuário. */
  leituras(userId: string, tarefaIds: string[]): Promise<Record<string, string>>;
  /** Último evento (horário e autor) de cada tarefa — base de "atualização não lida" e "sem atualização". */
  ultimosEventos(tarefaIds: string[]): Promise<Record<string, { em: string; por: string }>>;
  feedbacks(filtro: { dia?: string; responsavel?: string; desde?: string }): Promise<FeedbackRow[]>;
  feedback(id: string): Promise<FeedbackRow | null>;
  loteDoHash(hash: string): Promise<LoteEstado | null>;
  rotina(userId: string, dia: string): Promise<RotinaItemRow[]>;
  /** Último dia com rotina registrada antes de `dia` (para mostrar impedimentos que seguem). */
  rotinaAnterior(userId: string, dia: string): Promise<{ dia: string; linhas: RotinaItemRow[] } | null>;
  /** Agenda sincronizada (origem simples_dental_browser) entre dois dias, e a última sincronização concluída. */
  agenda(de: string, ate: string): Promise<{ itens: CompromissoAgenda[]; ultimaSync: string | null }>;

  // escrita
  criarLote(l: { hash: string; origem: string; consultadoEm: string; criadoPor: string; itens: { index: number; tipo: string; chaveOrigem?: string; resultado: Classificacao; payload: unknown; resolution?: unknown }[] }): Promise<string>;
  /** Abre o lote antes de aplicar (status em_andamento); devolve o existente se o hash já existe. */
  abrirLote(l: { hash: string; origem: string; consultadoEm: string; criadoPor: string }): Promise<string>;
  /** Grava o resultado de um item logo depois de aplicado (ou a falha), para retomar só o que falta. */
  registrarItemLote(loteId: string, i: { index: number; tipo: string; chaveOrigem?: string; resultado: Classificacao; payload: unknown; resolution?: unknown; aplicado: boolean; erro?: string | null }): Promise<void>;
  concluirLote(loteId: string): Promise<void>;
  criarPaciente(ref: PacienteRef, criadoPor: string): Promise<string>;
  criarAtendimento(a: { patientId: string; chaveOrigem: string | null; data: string; dataStatus: "exata" | "pendente_validacao"; consultadoEm: string; origem: string }): Promise<string>;
  atualizarDataAtendimento(id: string, data: string): Promise<void>;
  /** Regra atômica do banco: marca realizado e cria/recalcula os marcos escolhidos (0012/0013). */
  confirmarAtendimento(id: string, data: string, ator: string, marcos?: TipoMarco[]): Promise<void>;
  anularAtendimento(id: string, motivo: string, ator: string): Promise<void>;
  criarTarefa(t: { patientId: string | null; assunto?: string | null; kind: TipoTarefa; title: string; chaveOrigem: string | null; due: string; aConferir: string[]; payload: Record<string, unknown>; financialImpact: number | null; origem: string; origemData: string; assignedTo?: string | null; nextAction?: string | null; prioridade?: Prioridade | null; status?: StatusTarefaDb; aguardando?: "paciente" | "gestao" | null }): Promise<string>;
  atualizarTarefaEntrada(id: string, t: { title: string; aConferir: string[]; payload: Record<string, unknown>; financialImpact: number | null }): Promise<void>;
  registrarEvento(e: EventoRow): Promise<void>;
  atualizarMarco(id: string, m: { status?: StatusMarcoDb; statusReason?: string | null; dueCurrent?: string }): Promise<void>;
  atualizarTarefa(id: string, t: { status?: StatusTarefaDb; due?: string; closedReason?: string | null; waiting?: boolean; title?: string; nextAction?: string | null; assignedTo?: string | null; payload?: Record<string, unknown>; financialImpact?: number | null; aguardando?: "paciente" | "gestao" | null; prioridade?: Prioridade | null; prazoOriginal?: string | null; adiamentos?: number }): Promise<void>;
  salvarNumeros(dia: string, n: NumerosDoDia, ator: string): Promise<void>;
  salvarEstadoDoDia(dia: string, e: Partial<EstadoDoDia>, ator: string): Promise<void>;
  salvarConfig(c: Partial<FilaConfig>, ator: string): Promise<void>;
  salvarItemRotina(r: RotinaItemRow): Promise<void>;
  salvarConferenciaCaixa(c: ConferenciaCaixa): Promise<void>;
  /** Grava compromissos lidos do Simples Dental (motor idempotente de lib/sync), com a autoria de quem disparou. */
  sincronizarAgenda(itens: NormalizedAppointment[], ator: string): Promise<{ total: number; created: number; updated: number; unchanged: number; requiresReview: number }>;
  marcarLido(tarefaId: string, userId: string): Promise<void>;
  /** Insere a versão (id do cliente; repetir não duplica). */
  inserirFeedback(f: FeedbackRow): Promise<void>;
  atualizarFeedback(id: string, f: Partial<Pick<FeedbackRow, "status" | "texto" | "contadores" | "eventos" | "geradoEm" | "entregueEm" | "copiadoEm" | "whatsappConfirmadoEm" | "observacaoGestao" | "ajusteSolicitadoEm" | "ajusteSolicitadoPor">>): Promise<void>;
  auditar(a: { actor: string; action: string; target: string; before?: unknown; after?: unknown; reason?: string | null }): Promise<void>;
}

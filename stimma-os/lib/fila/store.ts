import type { PacienteRef } from "./contrato";
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

export const TIPOS_EVENTO = ["contato", "resposta", "agendamento_obtido", "cancelamento", "recebimento_confirmado", "atendimento_realizado", "adiamento", "encerramento", "encaminhamento", "correcao", "registro"] as const;
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
}

export interface EstadoDoDia {
  prioridades: PrioridadeDoDia[];
  /** Seções revisadas e marcadas "sem ocorrências" (ausente = não revisada). */
  secoes: Partial<Record<Categoria, "sem_ocorrencias">>;
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
  numerosDoDia(dia: string): Promise<NumerosDoDia | null>;
  estadoDoDia(dia: string): Promise<EstadoDoDia>;

  // escrita
  criarLote(l: { hash: string; origem: string; consultadoEm: string; criadoPor: string; itens: { index: number; tipo: string; chaveOrigem?: string; resultado: Classificacao; payload: unknown; resolution?: unknown }[] }): Promise<string>;
  criarPaciente(ref: PacienteRef, criadoPor: string): Promise<string>;
  criarAtendimento(a: { patientId: string; chaveOrigem: string | null; data: string; dataStatus: "exata" | "pendente_validacao"; consultadoEm: string; origem: string }): Promise<string>;
  atualizarDataAtendimento(id: string, data: string): Promise<void>;
  /** Regra atômica do banco: marca realizado e cria/recalcula os marcos escolhidos (0012/0013). */
  confirmarAtendimento(id: string, data: string, ator: string, marcos?: TipoMarco[]): Promise<void>;
  anularAtendimento(id: string, motivo: string, ator: string): Promise<void>;
  criarTarefa(t: { patientId: string | null; assunto?: string | null; kind: TipoTarefa; title: string; chaveOrigem: string | null; due: string; aConferir: string[]; payload: Record<string, unknown>; financialImpact: number | null; origem: string; origemData: string; assignedTo?: string | null; nextAction?: string | null }): Promise<string>;
  atualizarTarefaEntrada(id: string, t: { title: string; aConferir: string[]; payload: Record<string, unknown>; financialImpact: number | null }): Promise<void>;
  registrarEvento(e: EventoRow): Promise<void>;
  atualizarMarco(id: string, m: { status?: StatusMarcoDb; statusReason?: string | null; dueCurrent?: string }): Promise<void>;
  atualizarTarefa(id: string, t: { status?: StatusTarefaDb; due?: string; closedReason?: string | null; waiting?: boolean; title?: string; nextAction?: string | null; assignedTo?: string | null; payload?: Record<string, unknown>; financialImpact?: number | null }): Promise<void>;
  salvarNumeros(dia: string, n: NumerosDoDia, ator: string): Promise<void>;
  salvarEstadoDoDia(dia: string, e: Partial<EstadoDoDia>, ator: string): Promise<void>;
  auditar(a: { actor: string; action: string; target: string; before?: unknown; after?: unknown; reason?: string | null }): Promise<void>;
}

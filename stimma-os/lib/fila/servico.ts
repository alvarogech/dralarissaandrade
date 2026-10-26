import { hashLote, lerLote, type CabecalhoLote, type ItemEntrada, type PacienteRef } from "./contrato";
import { hojeSaoPaulo, isDiaIso, somarDias } from "./datas";
import { ROTULO_MARCO } from "./marcos";
import { montarFila, type Fila, type ItemFila } from "./agrupamento";
import { montarPrevia, type ItemPrevia } from "./previa";
import { montarFechamento, refDoItem, textoWhatsapp, nomeCurto, type Fechamento } from "./fechamento";
import { lerFeedback, linhaSemConteudo } from "./feedback";
import { CATEGORIAS, type EstadoDoDia, type EventoRow, type FilaConfig, type FilaStore, type MarcoRow, type NumerosDoDia, type Prioridade, type TarefaRow, type TipoEvento, type TipoTarefa } from "./store";
import { categoriaDaTarefa, rotuloResponsavel, type EtapaClinica } from "./registro";
import { responsavelEfetivo } from "./trabalho";
import { CHAVES_LINK_ROTINA, linkSeguro, resumirRotina } from "./rotina-itens";
import { cobrancaRotineira, type CobrancaLegada } from "./cobrancas";

/**
 * Regras de negócio da fila. Os Route Handlers só autenticam e chamam daqui; o mesmo código
 * roda contra o Supabase (produção) e contra a store em memória (testes e demonstração).
 *
 * Três conceitos nunca se confundem: ação executada (evento), objetivo resolvido (status do item)
 * e próxima ação (data + texto). Enviar cobrança é ação; pagamento confirmado é objetivo.
 */
export interface Ator {
  id: string;
  email: string;
  /** Gestão: lança entradas, cria/edita/cancela tarefas, anula lançamentos. Concierge: trabalha a fila. */
  gestao: boolean;
}

export class ErroRegra extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export const HORIZONTE_PROXIMAS_DIAS = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dataBr = (iso: string) => iso.split("-").reverse().join("/");

function diaSP(iso: string): string {
  return hojeSaoPaulo(new Date(iso));
}

function exigirGestao(ator: Ator, oque: string) {
  if (!ator.gestao) throw new ErroRegra(`Só a gestão pode ${oque}.`, 403);
}

/** Ids de pacientes (sem repetição) de linhas que podem não ter paciente (assunto administrativo). */
function idsDePacientes(rows: { patientId: string | null }[]): string[] {
  return [...new Set(rows.map((r) => r.patientId).filter((x): x is string => !!x))];
}

function novoId(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------- entrada (levantamento)

export interface ResultadoPrevia {
  cabecalho: CabecalhoLote;
  hash: string;
  jaImportado: boolean;
  previa: ItemPrevia[];
  pacientes: { id: string; nome: string }[];
}

export async function previaEntrada(store: FilaStore, texto: string, indices?: number[]): Promise<ResultadoPrevia> {
  const lido = lerLote(texto);
  if (!lido.ok) throw new ErroRegra(lido.erro);
  const hash = hashLote(texto);
  const pacientes = await store.pacientes();
  // Na publicação em partes, só as chaves do trecho são consultadas (consulta cara por chave).
  const chaves = lido.itens.filter((i) => !indices || indices.includes(i.index)).map((i) => i.item?.chave_origem).filter((c): c is string => !!c);
  const registros = await store.registrosPorChave(chaves);
  const atendimentos = await store.atendimentosDe(pacientes.map((p) => p.id));
  const abertas = (await store.tarefasAtivas(hojeSaoPaulo())).filter((t) => !["completed", "cancelled"].includes(t.status));
  const previa = montarPrevia(lido.itens, {
    pacientes, registros, atendimentos,
    tarefasAbertas: abertas.filter((t) => t.patientId).map((t) => ({ id: t.id, pacienteId: t.patientId!, kind: t.kind, titulo: t.title })),
  });
  const citados = new Set(previa.flatMap((p) => [...p.sugestoes, ...(p.pacienteId ? [p.pacienteId] : [])]));
  return {
    cabecalho: lido.cabecalho,
    hash,
    jaImportado: (await store.loteDoHash(hash))?.status === "confirmado",
    previa,
    pacientes: pacientes.filter((p) => citados.has(p.id)).map((p) => ({ id: p.id, nome: p.nome })),
  };
}

/** Decisão explícita da gestão para itens que a prévia não aplica sozinha. */
export type Resolucao = { acao: "vincular"; pacienteId: string } | { acao: "nova" } | { acao: "aceitar" } | { acao: "ignorar" };

export interface ResultadoEntrada {
  loteId: string;
  aplicados: number;
  atendimentosConfirmados: number;
  atendimentosPendentes: number;
  tarefas: number;
  naoAplicados: { index: number; classificacao: string; motivo: string }[];
  /** Itens deste lote que já tinham sido aplicados antes (retomada): não são repetidos. */
  jaAplicados: number[];
  /** Todos os itens do lote já têm resultado gravado. */
  concluido: boolean;
  /** Tarefas criadas sem responsável (concierge não configurada) — ficam na fila de atribuição da gestão. */
  semResponsavel: number;
}

/** Itens por requisição na publicação: cada trecho termina bem dentro do tempo da função. */
export const TAMANHO_TRECHO = 5;

/** Estado persistido de um lote (o que já foi salvo) — base para retomar sem duplicar. */
export async function estadoEntrada(store: FilaStore, ator: Ator, texto: string) {
  exigirGestao(ator, "consultar entradas");
  const lido = lerLote(texto);
  if (!lido.ok) throw new ErroRegra(lido.erro);
  const lote = await store.loteDoHash(hashLote(texto));
  return {
    existe: !!lote, loteId: lote?.id ?? null, status: lote?.status ?? null, total: lido.itens.length,
    aplicados: (lote?.itens ?? []).filter((i) => i.aplicado).map((i) => i.index),
    comErro: (lote?.itens ?? []).filter((i) => i.erro).map((i) => ({ index: i.index, erro: i.erro! })),
    pendentes: (lote?.itens ?? []).filter((i) => !i.aplicado && !i.erro).map((i) => i.index),
  };
}

const TITULO_TAREFA: Record<Exclude<ItemEntrada["tipo"], "atendimento_realizado">, string> = {
  cobranca: "Cobrança",
  recuperacao_falta: "Recuperar falta/cancelamento",
  continuidade: "Continuidade de tratamento",
  relacionamento: "Relacionamento",
  encaminhamento: "Encaminhamento",
  outro: "Tarefa",
};

function dadosTarefa(it: ItemEntrada, hoje: string, config: FilaConfig) {
  const d = it.dados;
  const tipo = it.tipo as Exclude<ItemEntrada["tipo"], "atendimento_realizado">;
  const extra =
    tipo === "cobranca" ? (typeof d.descricao === "string" ? d.descricao : "") :
    tipo === "recuperacao_falta" ? `${d.ocorrencia} em ${dataBr(String(d.data_ocorrencia))}` :
    tipo === "continuidade" ? String(d.contexto ?? "") :
    tipo === "relacionamento" ? String(d.subtipo ?? "") :
    tipo === "encaminhamento" ? `para ${d.para}: ${d.motivo}` : "";
  const acao = typeof d.acao === "string" && d.acao.trim() ? d.acao.trim() : null;
  const prazo = typeof d.prazo === "string" && isDiaIso(d.prazo) ? d.prazo : null;
  const venc = tipo === "cobranca" && typeof d.vencimento === "string" && isDiaIso(d.vencimento) ? d.vencimento : null;
  return {
    kind: tipo as TipoTarefa,
    title: acao ?? (extra ? `${TITULO_TAREFA[tipo]} — ${extra}` : TITULO_TAREFA[tipo]),
    due: prazo ?? venc ?? hoje, // cobrança vencida entra com a data real: aparece como atrasada
    financialImpact: tipo === "cobranca" && typeof d.valor === "number" ? d.valor : null,
    payload: { ...d, ...(it.nota_ia ? { nota_ia: it.nota_ia } : {}), origem: it.origem, consultado_em: it.consultado_em },
    // Destinada à concierge: usa a responsável configurada; sem configuração, fica sem responsável
    // (fila de atribuição da gestão) — nunca se adivinha uma conta pelo nome.
    assignedTo: tipo === "encaminhamento" && d.para === "gestao" ? config.gestorId : config.conciergeId,
  };
}

/**
 * Publica um lote — inteiro ou num trecho (`indices`). O lote é aberto ANTES de aplicar e cada item
 * grava seu resultado logo depois de aplicado: se a requisição cair no meio, o que foi salvo fica
 * comprovado no banco e a retomada aplica só o que falta (itens já aplicados são pulados).
 */
/** Motivo gravado no lote quando uma cobrança rotineira não vira tarefa. */
export const MOTIVO_COBRANCA_ROTINEIRA = "cobrança rotineira: não vira tarefa individual — a conferência é feita na rotina de segunda e sexta (Simples Dental)";

/**
 * `excecoesCobranca`: índices de itens de cobrança que a gestão marcou como exceção (exigem ação
 * específica ou decisão da gestão). Os demais itens de cobrança não geram nem atualizam tarefas:
 * a cobrança rotineira é o item da rotina de segunda e sexta. O contrato stimma-entrada-v1 e a
 * validação não mudam; o item fica registrado no lote como não aplicado, com o motivo.
 */
export async function confirmarEntrada(store: FilaStore, ator: Ator, texto: string, resolucoes: Record<number, Resolucao> = {}, indices?: number[], excecoesCobranca: number[] = []): Promise<ResultadoEntrada> {
  exigirGestao(ator, "lançar entradas");
  const p = await previaEntrada(store, texto, indices);
  const hoje = hojeSaoPaulo();
  const config = await store.config();
  const idsValidos = new Set((await store.pacientes()).map((x) => x.id));
  const criadosPorIdSd = new Map<string, string>();
  const anterior = await store.loteDoHash(p.hash);
  const jaAplicados = new Set((anterior?.itens ?? []).filter((i) => i.aplicado).map((i) => i.index));
  const loteId = anterior?.id ?? (await store.abrirLote({ hash: p.hash, origem: p.cabecalho.origem, consultadoEm: p.cabecalho.consultado_em, criadoPor: ator.id }));
  const res: ResultadoEntrada = { loteId, aplicados: 0, atendimentosConfirmados: 0, atendimentosPendentes: 0, tarefas: 0, naoAplicados: [], jaAplicados: [], concluido: false, semResponsavel: 0 };

  for (const item of p.previa) {
    if (indices && !indices.includes(item.index)) continue;
    if (jaAplicados.has(item.index)) {
      res.jaAplicados.push(item.index);
      continue;
    }
    const r = resolucoes[item.index];
    let aplicar = item.classificacao === "novo" || item.classificacao === "atualizacao";
    let pacienteId = item.pacienteId;
    if (item.classificacao === "vinculo_pendente" && r?.acao === "vincular") {
      if (!idsValidos.has(r.pacienteId)) throw new ErroRegra(`Paciente escolhida para o item ${item.index + 1} não existe.`);
      aplicar = true;
      pacienteId = r.pacienteId;
    }
    if (item.classificacao === "vinculo_pendente" && r?.acao === "nova") aplicar = true;
    if (item.classificacao === "possivel_duplicidade" && r?.acao === "aceitar") aplicar = true;
    if (r?.acao === "ignorar") aplicar = false;
    const cobrancaRotineiraDaEntrada = item.item?.tipo === "cobranca" && !excecoesCobranca.includes(item.index);

    const registro = { index: item.index, tipo: item.item?.tipo ?? "invalido", chaveOrigem: item.item?.chave_origem, resultado: item.classificacao, payload: { item: item.item, erros: item.erros, avisos: item.avisos }, resolution: r ?? (aplicar ? { acao: "automatico" } : null) };
    if (!aplicar || !item.item || cobrancaRotineiraDaEntrada) {
      const motivo = r?.acao === "ignorar" ? "ignorado pela gestão" : aplicar && cobrancaRotineiraDaEntrada ? MOTIVO_COBRANCA_ROTINEIRA : item.motivo;
      await store.registrarItemLote(loteId, { ...registro, resolution: aplicar && cobrancaRotineiraDaEntrada ? { acao: "cobranca_rotineira" } : registro.resolution, aplicado: false });
      res.naoAplicados.push({ index: item.index, classificacao: item.classificacao, motivo });
      continue;
    }
    try {
      await aplicarItem(item.item, pacienteId, excecoesCobranca.includes(item.index));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await store.registrarItemLote(loteId, { ...registro, aplicado: false, erro: msg }).catch(() => undefined);
      throw new ErroRegra(`O item #${item.index + 1} não foi salvo (${e instanceof ErroRegra ? msg : "falha ao gravar"}). Os anteriores ficaram salvos; corrija e retome.`, e instanceof ErroRegra ? e.status : 500);
    }
    await store.registrarItemLote(loteId, { ...registro, aplicado: true });
    res.aplicados++;
  }

  const estado = await store.loteDoHash(p.hash);
  const comResultado = new Set((estado?.itens ?? []).map((i) => i.index));
  res.concluido = p.previa.every((i) => comResultado.has(i.index));
  if (res.concluido && estado?.status !== "confirmado") {
    await store.concluirLote(loteId);
    await store.auditar({ actor: ator.email, action: "fila_entrada_confirmada", target: `import_batches/${loteId}`, after: { aplicados: (estado?.itens ?? []).filter((i) => i.aplicado).length, naoAplicados: (estado?.itens ?? []).filter((i) => !i.aplicado).length } });
  }
  return res;

  async function aplicarItem(it: ItemEntrada, pacienteId: string | null, excecao: boolean) {
    if (!pacienteId) {
      const idSd = it.paciente.sd_codigo ?? it.paciente.sd_numero ?? it.paciente.sd_ficha_id;
      pacienteId = (idSd && criadosPorIdSd.get(idSd)) || (await store.criarPaciente(it.paciente, ator.id));
      if (idSd) criadosPorIdSd.set(idSd, pacienteId);
      await store.auditar({ actor: ator.email, action: "fila_paciente_criada", target: `patients/${pacienteId}`, after: { ...it.paciente, telefone: undefined } });
    }

    if (it.tipo === "atendimento_realizado") {
      const data = String(it.dados.data_atendimento);
      const pendente = it.a_conferir.includes("data_atendimento") || it.a_conferir.includes("status_no_sd");
      const existente = it.chave_origem ? await store.atendimentoPorChave(it.chave_origem) : null;
      if (existente) {
        if (existente.dataRealizada !== data) {
          await store.atualizarDataAtendimento(existente.id, data);
          if (existente.realizadoConfirmado) await store.confirmarAtendimento(existente.id, data, ator.id);
        }
        if (existente.realizadoConfirmado) res.atendimentosConfirmados++;
        else res.atendimentosPendentes++;
      } else {
        const id = await store.criarAtendimento({ patientId: pacienteId, chaveOrigem: it.chave_origem ?? null, data, dataStatus: pendente ? "pendente_validacao" : "exata", consultadoEm: it.consultado_em, origem: it.origem });
        if (pendente) res.atendimentosPendentes++;
        else {
          await store.confirmarAtendimento(id, data, ator.id);
          res.atendimentosConfirmados++;
        }
      }
    } else {
      const base = dadosTarefa(it, hoje, config);
      // Cobrança só chega aqui como exceção decidida pela gestão: fica na fila da concierge.
      const t = { ...base, payload: it.tipo === "cobranca" && excecao ? { ...base.payload, excecao: true } : (base.payload as Record<string, unknown>) };
      const existente = it.chave_origem ? await store.tarefaPorChave(it.chave_origem) : null;
      if (existente) await store.atualizarTarefaEntrada(existente.id, { title: t.title, aConferir: it.a_conferir, payload: t.payload, financialImpact: t.financialImpact });
      else {
        await store.criarTarefa({ ...t, patientId: pacienteId, chaveOrigem: it.chave_origem ?? null, aConferir: it.a_conferir, origem: it.origem, origemData: it.consultado_em.slice(0, 10) });
        if (!t.assignedTo) res.semResponsavel++;
      }
      res.tarefas++;
    }
  }
}

// ---------------------------------------------------------------- tarefas da gestão (manual)

export interface NovaTarefa {
  pacienteId?: string;
  novoPaciente?: PacienteRef;
  /** Assunto administrativo sem paciente (não cria cadastro). */
  assunto?: string;
  kind: TipoTarefa;
  acao: string;
  contexto?: string;
  orientacao?: string;
  resultadoEsperado?: string;
  prioridade?: Prioridade | null;
  prazo: string;
  valor?: number | null;
  vencimento?: string | null;
  responsavel?: string | null;
  origem?: string;
  /** Falta/cancelamento: só o que se sabe (nunca presumido). */
  ocorrencia?: "falta" | "cancelamento" | null;
  dataOcorrencia?: string | null;
}

export const KINDS_MANUAIS: TipoTarefa[] = ["pendencia", "outro", "recuperacao_falta", "continuidade", "relacionamento", "oportunidade", "pos_atendimento", "encaminhamento", "cobranca"];
const PRIORIDADES: Prioridade[] = ["alta", "normal", "baixa"];

export async function criarTarefaManual(store: FilaStore, ator: Ator, t: NovaTarefa): Promise<string> {
  exigirGestao(ator, "criar tarefas");
  if (!KINDS_MANUAIS.includes(t.kind)) throw new ErroRegra("Tipo de tarefa inválido.");
  if (!t.acao?.trim()) throw new ErroRegra("Descreva a ação solicitada.");
  if (!isDiaIso(t.prazo)) throw new ErroRegra("Informe o prazo (data exata).");
  // Publicar exige responsável: tarefa sem dono some da rotina de todo mundo.
  if (!t.responsavel) throw new ErroRegra("Defina o responsável antes de publicar a tarefa.");
  if (t.prioridade && !PRIORIDADES.includes(t.prioridade)) throw new ErroRegra("Prioridade inválida.");
  if (t.ocorrencia && !["falta", "cancelamento"].includes(t.ocorrencia)) throw new ErroRegra("Ocorrência inválida.");
  if (t.dataOcorrencia && !isDiaIso(t.dataOcorrencia)) throw new ErroRegra("Data da ocorrência inválida.");
  if (t.valor !== undefined && t.valor !== null && !(typeof t.valor === "number" && t.valor >= 0)) throw new ErroRegra("Valor inválido.");
  if (t.vencimento && !isDiaIso(t.vencimento)) throw new ErroRegra("Vencimento inválido.");
  let pacienteId = t.pacienteId ?? null;
  const assunto = !pacienteId && !t.novoPaciente?.nome?.trim() ? t.assunto?.trim() || null : null;
  if (pacienteId) {
    const nomes = await store.nomesPacientes([pacienteId]);
    if (!nomes[pacienteId]) throw new ErroRegra("Paciente não encontrada.", 404);
  } else if (assunto) {
    // Tarefa administrativa: sem paciente e sem cadastro fictício.
  } else {
    // Cadastro explícito pela gestão: nunca une com outra paciente por nome.
    const ref = t.novoPaciente ?? {};
    if (!ref.nome?.trim()) throw new ErroRegra("Escolha uma paciente, informe o nome de uma nova ou descreva o assunto administrativo.");
    pacienteId = await store.criarPaciente({ ...ref, nome: ref.nome.trim() }, ator.id);
    await store.auditar({ actor: ator.email, action: "fila_paciente_criada", target: `patients/${pacienteId}`, after: { nome: ref.nome, sd_codigo: ref.sd_codigo } });
  }
  const perfis = await store.perfis();
  if (!perfis.some((p) => p.id === t.responsavel)) throw new ErroRegra("Responsável inválido.");
  const id = await store.criarTarefa({
    patientId: pacienteId, assunto, kind: t.kind, title: t.acao.trim(), chaveOrigem: null, due: t.prazo, aConferir: [],
    payload: {
      contexto: t.contexto?.trim() || undefined, orientacao: t.orientacao?.trim() || undefined, resultado_esperado: t.resultadoEsperado?.trim() || undefined,
      vencimento: t.vencimento || undefined, origem: t.origem || "manual", criada_por: ator.email,
      // Cobrança criada à mão pela gestão é decisão explícita: exceção que fica na fila (cobrancas.ts).
      ...(t.kind === "cobranca" ? { excecao: true } : {}),
      ...(t.kind === "recuperacao_falta" && t.ocorrencia ? { ocorrencia: t.ocorrencia } : {}),
      ...(t.kind === "recuperacao_falta" && t.dataOcorrencia ? { data_ocorrencia: t.dataOcorrencia } : {}),
    },
    financialImpact: t.valor ?? null, origem: t.origem || "manual", origemData: hojeSaoPaulo(), assignedTo: t.responsavel, prioridade: t.prioridade ?? null,
  });
  await store.auditar({ actor: ator.email, action: "fila_tarefa_criada", target: `tasks/${id}`, after: t });
  return id;
}

export interface EdicaoTarefa {
  acao?: string;
  contexto?: string;
  orientacao?: string;
  resultadoEsperado?: string;
  prioridade?: Prioridade | null;
  prazo?: string;
  valor?: number | null;
  responsavel?: string | null;
  cancelar?: boolean;
  motivo?: string;
  /** Cobrança: true = exceção que fica na fila da concierge; false = volta a ser rotineira (só na visão da gestão). */
  excecaoCobranca?: boolean;
}

/**
 * Edição pela gestão, sempre com rastro: vira um evento "correcao" ligado à tarefa (histórico
 * com autor e data) + audit log. Nunca apaga o que a concierge registrou: tarefa já encerrada
 * não é editada, e os eventos dela continuam intocados.
 */
export async function editarTarefa(store: FilaStore, ator: Ator, id: string, e: EdicaoTarefa): Promise<void> {
  exigirGestao(ator, "editar tarefas");
  const t = await store.tarefa(id);
  if (!t) throw new ErroRegra("Tarefa não encontrada.", 404);
  if (["completed", "cancelled"].includes(t.status)) throw new ErroRegra("Tarefa já encerrada — o resultado registrado é preservado. Crie uma nova tarefa se precisar.");
  const mudancas: string[] = [];
  const patch: Parameters<FilaStore["atualizarTarefa"]>[1] = {};
  if (e.acao !== undefined && e.acao.trim() && e.acao.trim() !== t.title) {
    patch.title = e.acao.trim();
    mudancas.push(`ação: "${t.title}" → "${patch.title}"`);
  }
  if (e.contexto !== undefined && (e.contexto.trim() || "") !== String(t.payload.contexto ?? "")) {
    patch.payload = { ...t.payload, contexto: e.contexto.trim() || undefined };
    mudancas.push("contexto atualizado");
  }
  for (const [campo, chave, rotulo] of [["orientacao", "orientacao", "orientação"], ["resultadoEsperado", "resultado_esperado", "resultado esperado"]] as const) {
    const novo = e[campo];
    if (novo !== undefined && (novo.trim() || "") !== String(t.payload[chave] ?? "")) {
      patch.payload = { ...(patch.payload ?? t.payload), [chave]: novo.trim() || undefined };
      mudancas.push(`${rotulo} atualizada`);
    }
  }
  if (e.prioridade !== undefined && (e.prioridade ?? null) !== (t.prioridade ?? null)) {
    if (e.prioridade && !PRIORIDADES.includes(e.prioridade)) throw new ErroRegra("Prioridade inválida.");
    patch.prioridade = e.prioridade;
    mudancas.push(`prioridade: ${e.prioridade ?? "normal"}`);
  }
  if (e.prazo !== undefined && e.prazo !== t.due) {
    if (!isDiaIso(e.prazo)) throw new ErroRegra("Prazo inválido.");
    patch.due = e.prazo;
    mudancas.push(`prazo: ${dataBr(t.due)} → ${dataBr(e.prazo)}`);
  }
  if (e.valor !== undefined && e.valor !== t.financialImpact) {
    if (e.valor !== null && !(typeof e.valor === "number" && e.valor >= 0)) throw new ErroRegra("Valor inválido.");
    patch.financialImpact = e.valor;
    mudancas.push(`valor: ${t.financialImpact ?? "—"} → ${e.valor ?? "—"}`);
  }
  if (e.responsavel !== undefined && e.responsavel !== t.assignedTo) {
    const perfis = await store.perfis();
    if (!e.responsavel && !e.cancelar) throw new ErroRegra("Uma tarefa aberta precisa de responsável.");
    if (e.responsavel && !perfis.some((p) => p.id === e.responsavel)) throw new ErroRegra("Responsável inválido.");
    patch.assignedTo = e.responsavel;
    mudancas.push(`responsável: ${perfis.find((p) => p.id === e.responsavel)?.nome ?? "ninguém"}`);
  }
  if (e.excecaoCobranca !== undefined) {
    if (t.kind !== "cobranca") throw new ErroRegra("Só tarefas de cobrança podem ser marcadas como exceção.");
    if (e.excecaoCobranca !== (t.payload.excecao === true)) {
      if (!e.motivo?.trim()) throw new ErroRegra("Informe o motivo (qual ação específica ou decisão a exceção exige).");
      patch.payload = { ...(patch.payload ?? t.payload), excecao: e.excecaoCobranca || undefined };
      mudancas.push(e.excecaoCobranca ? "cobrança marcada como exceção (fica na fila da concierge)" : "cobrança volta a ser rotineira (sai da fila da concierge)");
    }
  }
  if (e.cancelar) {
    if (!e.motivo?.trim()) throw new ErroRegra("Cancelar exige motivo.");
    patch.status = "cancelled";
    patch.closedReason = `cancelada pela gestão: ${e.motivo.trim()}`;
    mudancas.push("cancelada");
  }
  if ((patch.due || patch.status) && !e.motivo?.trim()) throw new ErroRegra("Reagendar ou cancelar exige motivo.");
  if (patch.due && patch.due > t.due && !e.cancelar) {
    // Adiamento: preserva o prazo original e conta quantas vezes foi adiada.
    patch.prazoOriginal = t.prazoOriginal ?? t.due;
    patch.adiamentos = (t.adiamentos ?? 0) + 1;
  }
  if (!mudancas.length) throw new ErroRegra("Nada mudou.");
  await store.atualizarTarefa(id, patch);
  await store.registrarEvento({
    id: novoId(), patientId: t.patientId, kind: e.cancelar ? "encerramento" : "correcao", occurredOn: hojeSaoPaulo(), channel: null,
    notes: `${mudancas.join("; ")}${e.motivo?.trim() ? ` — motivo: ${e.motivo.trim()}` : ""}`, amount: null, amountOrigin: null,
    scheduledFor: null, createdBy: ator.id, alvos: [{ tarefaId: id }],
  });
  await store.auditar({ actor: ator.email, action: e.cancelar ? "fila_tarefa_cancelada" : "fila_tarefa_editada", target: `tasks/${id}`, before: { title: t.title, due: t.due, assignedTo: t.assignedTo }, after: patch, reason: e.motivo ?? null });
}

export interface EventoHistorico extends EventoRow {
  autor: string;
}

export async function historico(store: FilaStore, alvo: { tipo: "marco" | "tarefa"; id: string }): Promise<EventoHistorico[]> {
  const eventos = await store.eventosDoAlvo(alvo.tipo === "marco" ? { marcoId: alvo.id } : { tarefaId: alvo.id });
  const perfis = new Map((await store.perfis()).map((p) => [p.id, p.nome]));
  return eventos.map((e) => ({ ...e, autor: perfis.get(e.createdBy) ?? "—" }));
}

export async function listarTarefasGestao(store: FilaStore) {
  const hoje = hojeSaoPaulo();
  const tarefas = await store.tarefasAtivas(somarDias(hoje, -7));
  const nomes = await store.nomesPacientes(idsDePacientes(tarefas));
  const perfis = await store.perfis();
  const pacientes = (await store.pacientes()).map((p) => ({ id: p.id, nome: p.nome, sd_codigo: p.sd_codigo ?? null })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const config = await store.config();
  return {
    perfis,
    pacientes,
    conciergeId: config.conciergeId,
    gestorId: config.gestorId,
    tarefas: tarefas
      .map((t) => ({
        id: t.id, ref: refDoItem({ tipo: "tarefa", id: t.id }), paciente: t.patientId ? nomes[t.patientId] ?? "Paciente" : t.assunto ?? "Assunto", pacienteId: t.patientId,
        kind: t.kind, acao: t.title, contexto: String(t.payload.contexto ?? ""), prazo: t.due, valor: t.financialImpact,
        responsavel: t.assignedTo, status: t.status, proximaAcao: t.nextAction, resultado: t.closedReason, origem: t.origem,
        orientacao: String(t.payload.orientacao ?? ""), resultadoEsperado: String(t.payload.resultado_esperado ?? ""), prioridade: t.prioridade ?? null, aguardando: t.aguardando ?? null,
        rotineira: cobrancaRotineira(t), excecao: t.kind === "cobranca" && t.payload.excecao === true,
      }))
      .sort((a, b) => Number(["completed", "cancelled"].includes(a.status)) - Number(["completed", "cancelled"].includes(b.status)) || a.prazo.localeCompare(b.prazo)),
  };
}

// ---------------------------------------------------------------- atendimentos

/** Confirma o realizado: o banco cria sempre os três marcos (30 dias, 90 dias, 6 meses), sem escolha. */
export async function confirmarAtendimentoPendente(store: FilaStore, ator: Ator, id: string, data: string) {
  if (!isDiaIso(data)) throw new ErroRegra("Informe a data exata do atendimento.");
  if (data > hojeSaoPaulo()) throw new ErroRegra("A data do atendimento não pode estar no futuro.");
  const a = await store.atendimento(id);
  if (!a) throw new ErroRegra("Atendimento não encontrado.", 404);
  if (a.anulado) throw new ErroRegra("Atendimento anulado não pode ser confirmado.");
  await store.confirmarAtendimento(id, data, ator.id);
  await store.auditar({ actor: ator.email, action: "fila_atendimento_confirmado", target: `appointments/${id}`, before: { data: a.dataRealizada, status: a.dataStatus }, after: { data, marcos: ["d30", "d90", "m6"] } });
}

export async function anularAtendimento(store: FilaStore, ator: Ator, id: string, motivo: string) {
  exigirGestao(ator, "anular um atendimento");
  if (!motivo.trim()) throw new ErroRegra("O motivo da anulação é obrigatório.");
  const a = await store.atendimento(id);
  if (!a || a.anulado) throw new ErroRegra("Atendimento inexistente ou já anulado.", 404);
  await store.anularAtendimento(id, motivo.trim(), ator.id);
  await store.auditar({ actor: ator.email, action: "fila_atendimento_anulado", target: `appointments/${id}`, reason: motivo.trim() });
}

// ---------------------------------------------------------------- ações na fila (concierge)

export type Acao = "contato" | "resposta" | "adiar" | "agendamento" | "recebimento" | "comparecimento" | "encerrar";

export interface EntradaAcao {
  eventoId: string;
  alvos: { tipo: "marco" | "tarefa"; id: string }[];
  acao: Acao;
  data?: string;
  canal?: string;
  notas?: string;
  novaData?: string;
  proximaAcao?: string;
  agendadoPara?: string;
  valor?: number;
  origemValor?: string;
  motivo?: string;
  /** encerrar: resolvido (objetivo alcançado, com resultado) ou dispensado (não precisa mais). */
  desfecho?: "resolvido" | "contemplado" | "dispensado";
  /** comparecimento */
  compareceu?: boolean;
}

const EVENTO_DA_ACAO: Record<Acao, TipoEvento> = {
  contato: "contato", resposta: "resposta", adiar: "adiamento", agendamento: "agendamento_obtido",
  recebimento: "recebimento_confirmado", comparecimento: "atendimento_realizado", encerrar: "encerramento",
};

export async function registrarAcao(store: FilaStore, ator: Ator, e: EntradaAcao): Promise<{ duplicado: boolean }> {
  if (!UUID.test(e.eventoId)) throw new ErroRegra("eventoId inválido.");
  if (await store.eventoExiste(e.eventoId)) return { duplicado: true }; // reenvio (duplo clique, rede): não duplica
  if (!e.alvos?.length) throw new ErroRegra("Escolha ao menos um item.");
  const hoje = hojeSaoPaulo();
  const data = e.data ?? hoje;
  if (!isDiaIso(data) || data > hoje) throw new ErroRegra("A data do registro precisa ser hoje ou um dia anterior.");

  const marcos: MarcoRow[] = [];
  const tarefas: TarefaRow[] = [];
  for (const a of e.alvos) {
    const row = a.tipo === "marco" ? await store.marco(a.id) : await store.tarefa(a.id);
    if (!row) throw new ErroRegra("Item não encontrado.", 404);
    const fechado = a.tipo === "marco" ? !["previsto", "contatado"].includes((row as MarcoRow).status) : ["completed", "cancelled"].includes((row as TarefaRow).status);
    if (fechado) throw new ErroRegra("Um dos itens já foi encerrado.");
    if (a.tipo === "marco") marcos.push(row as MarcoRow);
    else tarefas.push(row as TarefaRow);
  }
  const pacientes = new Set([...marcos, ...tarefas].map((r) => r.patientId));
  if (pacientes.size !== 1) throw new ErroRegra("Tratar junto só vale para itens da mesma paciente.");
  const patientId = [...pacientes][0]!;
  const proxima = e.proximaAcao?.trim() || null;

  const precisaNovaData = e.acao === "adiar" || e.acao === "resposta";
  if (precisaNovaData && (!e.novaData || !isDiaIso(e.novaData) || e.novaData < hoje)) throw new ErroRegra("Informe a data do próximo passo (hoje ou depois).");
  if (e.acao === "adiar" && !e.motivo?.trim()) throw new ErroRegra("Adiar exige justificativa.");
  if (e.acao === "contato" && e.novaData && (!isDiaIso(e.novaData) || e.novaData < hoje)) throw new ErroRegra("Data de nova tentativa inválida.");
  if (e.acao === "agendamento" && (!e.agendadoPara || !isDiaIso(e.agendadoPara))) throw new ErroRegra("Informe a data da consulta agendada.");
  if (e.acao === "recebimento") {
    if (marcos.length || tarefas.some((t) => t.kind !== "cobranca")) throw new ErroRegra("Recebimento só se registra em itens de cobrança.");
    if (!(typeof e.valor === "number" && e.valor > 0)) throw new ErroRegra("Informe o valor recebido.");
    if (!e.origemValor) throw new ErroRegra("Informe a origem do valor (parcela, dívida antiga, nova contratação…).");
  }
  if (e.acao === "comparecimento") {
    if (marcos.length || tarefas.some((t) => t.payload.subtipo !== "comparecimento")) throw new ErroRegra("Comparecimento só se registra na tarefa de confirmar comparecimento.");
    if (typeof e.compareceu !== "boolean") throw new ErroRegra("Informe se a paciente compareceu.");
  }
  const desfecho = e.desfecho === "contemplado" ? "resolvido" : e.desfecho;
  if (e.acao === "encerrar") {
    if (!desfecho) throw new ErroRegra("Encerrar exige desfecho.");
    if (!e.motivo?.trim()) throw new ErroRegra(desfecho === "resolvido" ? "Descreva o resultado alcançado." : "Informe o motivo.");
  }

  const kind: TipoEvento = e.acao === "comparecimento" && !e.compareceu ? "cancelamento" : EVENTO_DA_ACAO[e.acao];
  await store.registrarEvento({
    id: e.eventoId, patientId, kind, occurredOn: data, channel: e.canal ?? null,
    notes: [e.notas?.trim(), e.motivo?.trim(), proxima ? `próxima ação: ${proxima}` : null].filter(Boolean).join(" — ") || null,
    amount: e.acao === "recebimento" ? e.valor! : null, amountOrigin: e.acao === "recebimento" ? e.origemValor! : null,
    scheduledFor: e.acao === "agendamento" ? e.agendadoPara! : null, createdBy: ator.id,
    alvos: [...marcos.map((m) => ({ marcoId: m.id })), ...tarefas.map((t) => ({ tarefaId: t.id }))],
  });

  for (const m of marcos) {
    if (e.acao === "contato") await store.atualizarMarco(m.id, e.novaData ? { status: "previsto", dueCurrent: e.novaData, statusReason: proxima } : { status: "contatado", statusReason: proxima });
    if (precisaNovaData) await store.atualizarMarco(m.id, { status: "previsto", dueCurrent: e.novaData!, statusReason: proxima });
    if (e.acao === "agendamento") await store.atualizarMarco(m.id, { status: "contemplado", statusReason: `agendado para ${e.agendadoPara}` });
    if (e.acao === "encerrar") await store.atualizarMarco(m.id, { status: desfecho === "resolvido" ? "contemplado" : "dispensado", statusReason: e.motivo!.trim() });
  }
  for (const t of tarefas) {
    if (e.acao === "contato") await store.atualizarTarefa(t.id, e.novaData ? { status: "open", due: e.novaData, nextAction: proxima } : { status: "waiting", waiting: true, nextAction: proxima });
    if (precisaNovaData) await store.atualizarTarefa(t.id, { status: "open", due: e.novaData!, nextAction: proxima });
    if (e.acao === "agendamento") await store.atualizarTarefa(t.id, { status: "completed", closedReason: `agendamento obtido para ${dataBr(e.agendadoPara!)}` });
    if (e.acao === "recebimento") await store.atualizarTarefa(t.id, { status: "completed", closedReason: `recebimento confirmado: R$ ${e.valor!.toFixed(2).replace(".", ",")} (${e.origemValor!.replace(/_/g, " ")})` });
    if (e.acao === "encerrar") await store.atualizarTarefa(t.id, { status: desfecho === "resolvido" ? "completed" : "cancelled", closedReason: e.motivo!.trim() });
    if (e.acao === "comparecimento") await store.atualizarTarefa(t.id, { status: "completed", closedReason: e.compareceu ? "compareceu" : "faltou" });
  }

  // Continuidade automática (a concierge não relança nada em outro formulário):
  if (e.acao === "agendamento") {
    await store.criarTarefa({
      patientId, kind: "outro", title: `Confirmar comparecimento — consulta de ${dataBr(e.agendadoPara!)}`, chaveOrigem: `comparecimento:${e.eventoId}`,
      due: e.agendadoPara!, aConferir: [], payload: { subtipo: "comparecimento", agendado_para: e.agendadoPara, evento_origem: e.eventoId },
      financialImpact: null, origem: "agendamento", origemData: data,
    });
  }
  if (e.acao === "comparecimento") {
    const t = tarefas[0]!;
    const dataConsulta = typeof t.payload.agendado_para === "string" && isDiaIso(t.payload.agendado_para) ? t.payload.agendado_para : data;
    if (e.compareceu) {
      // Vira "atendimento a conferir": os marcos 30/90/6m só nascem quando o realizado for confirmado no Simples Dental.
      await store.criarAtendimento({ patientId, chaveOrigem: `comparecimento:${t.id}`, data: dataConsulta <= hoje ? dataConsulta : hoje, dataStatus: "pendente_validacao", consultadoEm: new Date().toISOString(), origem: "concierge_comparecimento" });
    } else {
      await store.criarTarefa({
        patientId, kind: "recuperacao_falta", title: `Recuperar falta — consulta de ${dataBr(dataConsulta)}`, chaveOrigem: `falta:${t.id}`,
        due: somarDias(hoje, 1), aConferir: [], payload: { ocorrencia: "falta", data_ocorrencia: dataConsulta }, financialImpact: null, origem: "comparecimento", origemData: data,
      });
    }
  }
  await store.auditar({ actor: ator.email, action: `fila_${e.acao}`, target: `patients/${patientId}`, after: { evento: e.eventoId, alvos: e.alvos } });
  return { duplicado: false };
}

// ---------------------------------------------------------------- leitura da fila

export interface FilaCarregada {
  hoje: string;
  fila: Fila;
  maisTarde: number;
  itens: ItemFila[];
  config: FilaConfig;
  /**
   * Cobranças individuais antigas (rotineiras) fora da fila operacional — a conferência agora é o
   * item da rotina de segunda e sexta. Preservadas no banco; listadas só para a gestão.
   */
  cobrancasRotineiras: CobrancaLegada[];
}

/** Encerradas há até 7 dias continuam consultáveis em "Concluídas". */
export const DIAS_CONCLUIDAS = 7;

/**
 * Lê a fila. Com `eu`, marca "não lido" por usuário: há registro de outra pessoa depois da última
 * vez que este usuário abriu o detalhe da tarefa.
 */
export async function carregarFila(store: FilaStore, hoje = hojeSaoPaulo(), eu?: string): Promise<FilaCarregada> {
  const desde = somarDias(hoje, -DIAS_CONCLUIDAS);
  const [marcos, todasTarefas, pendentes, perfis, config] = await Promise.all([store.marcosAtivos(desde), store.tarefasAtivas(desde), store.atendimentosPendentes(), store.perfis(), store.config()]);
  // Cobranças rotineiras (legado) saem da fila operacional sem tocar no banco (ver cobrancas.ts).
  const rotineiras = todasTarefas.filter(cobrancaRotineira);
  const tarefas = todasTarefas.filter((t) => !cobrancaRotineira(t));
  const idsTarefas = tarefas.map((t) => t.id);
  // Consultas independentes em paralelo (antes eram sequenciais).
  const [ultimos, lidas, nomes] = await Promise.all([
    store.ultimosEventos(idsTarefas),
    eu ? store.leituras(eu, idsTarefas) : Promise.resolve({} as Record<string, string>),
    store.nomesPacientes(idsDePacientes([...marcos, ...tarefas, ...rotineiras, ...pendentes])),
  ]);
  const nome = (id: string) => nomes[id] ?? "Paciente";
  const nomePerfil = new Map(perfis.map((p) => [p.id, p.nome]));

  const itens: ItemFila[] = [
    ...marcos.map((m): ItemFila => ({
      id: `marco:${m.id}`, alvo: { tipo: "marco", id: m.id }, pacienteId: m.patientId, pacienteNome: nome(m.patientId), tipo: "marco",
      titulo: `Acompanhamento de ${ROTULO_MARCO[m.kind]}`, subtipo: m.kind, categoria: "recorrencia",
      detalhe: m.dueCurrent !== m.dueOriginal ? `previsto para ${dataBr(m.dueOriginal)}, adiado` : undefined,
      proximaAcao: m.status === "previsto" || m.status === "contatado" ? m.statusReason ?? undefined : undefined,
      contexto: m.status === "contemplado" || m.status === "dispensado" ? m.statusReason ?? undefined : undefined,
      status: m.status === "previsto" ? "aberta" : m.status === "contatado" ? "aguardando" : "concluida",
      aguardando: m.status === "contatado" ? "paciente" : undefined,
      due: m.dueCurrent, concluidaEm: ["contemplado", "dispensado"].includes(m.status) ? diaSP(m.updatedAt) : undefined,
      responsavelId: config.conciergeId, origem: "marco automático", origemData: m.dataAtendimento ?? undefined,
      dataAtendimento: m.dataAtendimento ?? undefined, prazoOriginal: m.dueOriginal, atualizadoEm: m.updatedAt,
    })),
    ...tarefas.map((t): ItemFila => {
      const etapa = (t.payload.etapa ?? null) as EtapaClinica | null;
      const detalhes = (t.payload.detalhes ?? {}) as Record<string, string>;
      const ult = ultimos[t.id];
      const ocorrencia = [t.payload.ocorrencia, detalhes.ocorrencia].find((o) => o === "falta" || o === "cancelamento") as "falta" | "cancelamento" | undefined;
      return {
        id: `tarefa:${t.id}`, alvo: { tipo: "tarefa", id: t.id },
        // Assunto sem paciente (pendência administrativa) vira um cartão próprio.
        pacienteId: t.patientId ?? `assunto:${t.id}`, pacienteNome: t.patientId ? nome(t.patientId) : t.assunto ?? "Assunto", semPaciente: !t.patientId || undefined,
        tipo: t.kind, categoria: categoriaDaTarefa(t),
        titulo: t.title, aConferir: t.aConferir, valor: t.financialImpact ?? undefined,
        contexto: [t.payload.contexto, t.payload.descricao, ...Object.entries(detalhes).filter(([, v]) => v).map(([k, v]) => `${ROTULO_DETALHE[k] ?? k}: ${v}`)]
          .filter((x) => typeof x === "string" && x).join(" · ") || undefined,
        proximaAcao: t.nextAction ?? undefined,
        responsavel: t.assignedTo ? nomePerfil.get(t.assignedTo) : rotuloResponsavel(typeof t.payload.responsavel === "string" ? t.payload.responsavel : undefined, perfis) ?? undefined,
        subtipo: typeof t.payload.subtipo === "string" ? t.payload.subtipo : undefined,
        atencao: t.payload.atencao === true || undefined,
        etapa: etapa && Object.values(etapa).some(Boolean) ? etapa : undefined,
        detalhe: ["completed", "cancelled"].includes(t.status) ? t.closedReason ?? undefined : undefined,
        status: t.status === "waiting" ? "aguardando" : ["completed", "cancelled"].includes(t.status) ? "concluida" : "aberta",
        aguardando: t.status === "waiting" ? t.aguardando ?? "paciente" : undefined,
        due: t.due, concluidaEm: ["completed", "cancelled"].includes(t.status) ? diaSP(t.updatedAt) : undefined,
        responsavelId: t.assignedTo, origem: t.origem ?? undefined, origemData: t.origemData ?? undefined, prioridade: t.prioridade ?? undefined,
        orientacao: typeof t.payload.orientacao === "string" ? t.payload.orientacao : undefined,
        resultadoEsperado: typeof t.payload.resultado_esperado === "string" ? t.payload.resultado_esperado : undefined,
        ocorrencia, dataOcorrencia: typeof t.payload.data_ocorrencia === "string" ? t.payload.data_ocorrencia : undefined,
        prazoOriginal: t.prazoOriginal ?? undefined, adiamentos: t.adiamentos ?? 0,
        atualizadoEm: ult?.em ?? t.criadoEm ?? t.updatedAt,
        naoLido: !!(eu && ult && ult.por !== eu && (!lidas[t.id] || lidas[t.id]! < ult.em)) || undefined,
      };
    }),
    ...pendentes.map((a): ItemFila => ({
      id: `atendimento:${a.id}`, alvo: { tipo: "atendimento", id: a.id }, pacienteId: a.patientId, pacienteNome: nome(a.patientId), tipo: "conferir_atendimento",
      categoria: "agenda", titulo: "Conferir atendimento no Simples Dental", detalhe: a.dataRealizada ? `data informada: ${dataBr(a.dataRealizada)}` : undefined,
      status: "aberta", due: diaSP(a.createdAt), responsavelId: config.conciergeId, origem: "conferência", origemData: diaSP(a.createdAt), atualizadoEm: a.createdAt,
    })),
  ];
  const limite = somarDias(hoje, HORIZONTE_PROXIMAS_DIAS);
  const visiveis = itens.filter((i) => i.status !== "aberta" || i.due <= limite);
  const cobrancasRotineiras = rotineiras
    .map((t): CobrancaLegada => ({ id: t.id, ref: refDoItem({ tipo: "tarefa", id: t.id }), paciente: t.patientId ? nome(t.patientId) : t.assunto ?? "Assunto", titulo: t.title, due: t.due, aguardandoPaciente: t.status === "waiting" }))
    .sort((a, b) => a.due.localeCompare(b.due));
  return { hoje, fila: montarFila(visiveis, hoje), maisTarde: itens.length - visiveis.length, itens, config, cobrancasRotineiras };
}

export const ROTULO_DETALHE: Record<string, string> = {
  ocorrencia: "Ocorrência", horario: "Horário", motivo_falta: "Motivo", remarcou: "Remarcou", nova_data: "Nova data",
  ponto_amanha: "Ponto de atenção", interesse: "Interesse", especialidade: "Tratamento/especialidade", objecao: "Resposta/objeção",
  motivo_contato: "Motivo do contato", ultimo_atendimento: "Último atendimento (aprox.)", procedimento: "Procedimento",
  necessidade: "Necessidade", tipo_pendencia: "Tipo", descricao: "Descrição", para: "Encaminhado para", motivo_encaminhamento: "Motivo",
  observacao: "Observação",
};

// ---------------------------------------------------------------- fechamento

/**
 * Fechamento de um dia. Com `responsavel`, respeita a autoria: só os registros dessa pessoa e só as
 * pendências sob a responsabilidade dela (marcos e conferências são da concierge) — nada de totais
 * gerais da clínica montados com dados parciais.
 */
export async function carregarFechamento(store: FilaStore, dia = hojeSaoPaulo(), responsavel?: string): Promise<{ fechamento: Fechamento; texto: string; eventos: EventoRow[] }> {
  if (!isDiaIso(dia)) throw new ErroRegra("Dia inválido.");
  const [todos, numeros, estado, carregada] = await Promise.all([store.eventosDoDia(dia), store.numerosDoDia(dia), store.estadoDoDia(dia), carregarFila(store, dia)]);
  const eventos = todos.filter((e) => e.kind !== "nota" && (!responsavel || e.createdBy === responsavel));
  const pessoas = { eu: responsavel ?? "", conciergeId: carregada.config.conciergeId, gestorId: carregada.config.gestorId };
  const itens = responsavel ? carregada.itens.filter((i) => { const r = responsavelEfetivo(i, pessoas); return !r || r === responsavel || i.aguardando === "gestao"; }) : carregada.itens;
  const fila = responsavel ? montarFila(itens, dia) : carregada.fila;
  const [nomes, linhasRotina, perfis] = await Promise.all([
    store.nomesPacientes(idsDePacientes(eventos)),
    responsavel ? store.rotina(responsavel, dia) : Promise.resolve([]),
    responsavel ? store.perfis() : Promise.resolve([]),
  ]);
  const rotina = responsavel ? resumirRotina(linhasRotina, dia, (r) => rotuloResponsavel(r ?? undefined, perfis)) : null;
  const fechamento = montarFechamento({ dia, hoje: hojeSaoPaulo(), eventos, fila, itens, nomes, numeros, estado, rotina });
  return { fechamento, texto: textoWhatsapp(fechamento), eventos };
}

/** Prioridades escolhidas (até 5, sugeridas ou manuais) e seções "sem ocorrências" do dia. */
export async function salvarEstadoDoDia(store: FilaStore, ator: Ator, dia: string, e: Partial<EstadoDoDia>) {
  if (!isDiaIso(dia) || dia > hojeSaoPaulo()) throw new ErroRegra("Dia inválido.");
  const limpo: Partial<EstadoDoDia> = {};
  if (e.prioridades !== undefined) {
    if (!Array.isArray(e.prioridades) || e.prioridades.length > 5) throw new ErroRegra("Escolha até cinco prioridades.");
    limpo.prioridades = e.prioridades
      .map((p) => ({ ref: typeof p.ref === "string" && p.ref ? p.ref : null, texto: String(p.texto ?? "").trim().slice(0, 200) }))
      .filter((p) => p.texto);
  }
  if (e.secoes !== undefined) {
    const ok = e.secoes && typeof e.secoes === "object" && Object.entries(e.secoes).every(([k, v]) => (CATEGORIAS as readonly string[]).includes(k) && v === "sem_ocorrencias");
    if (!ok) throw new ErroRegra("Seção inválida.");
    limpo.secoes = e.secoes;
  }
  await store.salvarEstadoDoDia(dia, limpo, ator.id);
  await store.auditar({ actor: ator.email, action: "fila_estado_do_dia", target: `daily_manual_figures/${dia}`, after: limpo });
}

export async function salvarNumeros(store: FilaStore, ator: Ator, dia: string, n: NumerosDoDia) {
  if (!isDiaIso(dia) || dia > hojeSaoPaulo()) throw new ErroRegra("Dia inválido.");
  for (const v of [n.agendaPrevista, n.agendaRealizada, n.caixaPrevisto, n.caixaRecebido]) {
    if (v !== null && !(typeof v === "number" && v >= 0 && Number.isFinite(v))) throw new ErroRegra("Os números precisam ser positivos.");
  }
  await store.salvarNumeros(dia, { ...n, caixaSituacao: n.caixaSituacao?.trim() || null }, ator.id);
  await store.auditar({ actor: ator.email, action: "fila_numeros_do_dia", target: `daily_manual_figures/${dia}`, after: n });
}

// ---------------------------------------------------------------- feedback colado na gestão

export type SituacaoLinha = "concluido" | "na_fila" | "revisar" | "sem_referencia";

export interface LinhaAnalisada {
  secao: string;
  texto: string;
  situacao: SituacaoLinha;
  detalhe: string;
  ref?: string;
  alvo?: { tipo: "marco" | "tarefa"; id: string };
}

/**
 * Consulta o que já está registrado antes de propor qualquer coisa. Linhas com referência são
 * comparadas com o banco: concluídas não são recriadas, abertas seguem na fila (a plataforma já
 * mantém a continuidade). Nada é criado aqui — só análise.
 */
export async function analisarFeedback(store: FilaStore, ator: Ator, texto: string): Promise<{ dia: string | null; formatoDaPlataforma: boolean; linhas: LinhaAnalisada[] }> {
  exigirGestao(ator, "importar feedback");
  const lido = lerFeedback(texto);
  if (!lido.linhas.length) throw new ErroRegra("Não encontrei linhas de feedback no texto colado.");
  const vistos = new Set<string>();
  const linhas: LinhaAnalisada[] = [];
  for (const l of lido.linhas) {
    if (linhaSemConteudo(l.texto)) continue;
    const refs = l.refs.filter((r) => r.tipo !== "atendimento");
    if (!refs.length) {
      linhas.push({ secao: l.secao, texto: l.texto, situacao: "sem_referencia", detalhe: "sem referência — revise e crie a tarefa se for uma pendência nova" });
      continue;
    }
    for (const r of refs) {
      if (vistos.has(r.ref)) continue;
      vistos.add(r.ref);
      const ids = await store.resolverRef(r.tipo === "marco" ? "marco" : "tarefa", r.prefixo);
      if (ids.length !== 1) {
        linhas.push({ secao: l.secao, texto: l.texto, situacao: "revisar", ref: r.ref, detalhe: ids.length ? "referência ambígua" : "referência não encontrada na plataforma" });
        continue;
      }
      const id = ids[0]!;
      if (r.tipo === "marco") {
        const m = (await store.marco(id))!;
        const aberto = ["previsto", "contatado"].includes(m.status);
        linhas.push({
          secao: l.secao, texto: l.texto, ref: r.ref, alvo: { tipo: "marco", id },
          situacao: aberto ? "na_fila" : "concluido",
          detalhe: aberto ? `segue na fila (${m.status === "contatado" ? "aguardando resposta" : `próximo passo em ${dataBr(m.dueCurrent)}`})` : `marco já ${m.status} — não será recriado`,
        });
      } else {
        const t = (await store.tarefa(id))!;
        const aberta = !["completed", "cancelled"].includes(t.status);
        linhas.push({
          secao: l.secao, texto: l.texto, ref: r.ref, alvo: { tipo: "tarefa", id },
          situacao: aberta ? "na_fila" : "concluido",
          detalhe: aberta
            ? `segue na fila (${t.status === "waiting" ? "aguardando resposta" : `próximo passo em ${dataBr(t.due)}`}${t.nextAction ? ` — ${t.nextAction}` : ""})`
            : `já encerrada (${t.closedReason ?? t.status}) — não será recriada`,
        });
      }
    }
  }
  return { dia: lido.dia, formatoDaPlataforma: lido.formatoDaPlataforma, linhas };
}

/** Tarefas abertas resumidas para a IA (referência curta + primeiro nome e inicial). */
export async function tarefasAbertasResumo(store: FilaStore) {
  const tarefas = (await store.tarefasAtivas(hojeSaoPaulo())).filter((t) => !["completed", "cancelled"].includes(t.status));
  const nomes = await store.nomesPacientes(idsDePacientes(tarefas));
  return tarefas.map((t) => ({ ref: refDoItem({ tipo: "tarefa", id: t.id }), id: t.id, paciente: t.patientId ? nomeCurto(nomes[t.patientId] ?? "Paciente") : t.assunto ?? "Assunto", tipo: t.kind, titulo: t.title, due: t.due }));
}

/** Aplica uma proposta de continuidade aprovada pela gestão (atualizar ou encerrar tarefa existente). */
export async function aplicarContinuidade(store: FilaStore, ator: Ator, p: { tarefaId: string; tipo: "atualizar_tarefa" | "encerrar_tarefa"; novaData?: string | null; proximaAcao?: string | null; motivo: string; diaFeedback: string }) {
  exigirGestao(ator, "aplicar continuidade");
  const t = await store.tarefa(p.tarefaId);
  if (!t) throw new ErroRegra("Tarefa não encontrada.", 404);
  if (["completed", "cancelled"].includes(t.status)) throw new ErroRegra("Tarefa já encerrada — nada a aplicar.");
  const origem = `conforme feedback de ${dataBr(p.diaFeedback)}`;
  if (p.tipo === "encerrar_tarefa") {
    if (!p.motivo.trim()) throw new ErroRegra("Informe o motivo do encerramento.");
    // Objetivo resolvido informado no feedback, aprovado pela gestão. Não registra recebimento
    // como fato financeiro: só encerra a tarefa com o motivo e a origem.
    const motivo = `${p.motivo.trim()} (${origem}, aprovado pela gestão)`;
    await store.atualizarTarefa(p.tarefaId, { status: "completed", closedReason: motivo });
    await store.registrarEvento({
      id: novoId(), patientId: t.patientId, kind: "encerramento", occurredOn: hojeSaoPaulo(), channel: null, notes: motivo,
      amount: null, amountOrigin: null, scheduledFor: null, createdBy: ator.id, alvos: [{ tarefaId: p.tarefaId }],
    });
    await store.auditar({ actor: ator.email, action: "fila_continuidade_encerrar", target: `tasks/${p.tarefaId}`, reason: motivo });
    return;
  }
  const patch: EdicaoTarefa = { motivo: `${p.motivo.trim() || "continuidade"} (${origem})` };
  if (p.novaData) patch.prazo = p.novaData;
  await editarTarefa(store, ator, p.tarefaId, patch).catch((err) => {
    if (!(err instanceof ErroRegra && err.message === "Nada mudou.")) throw err;
  });
  if (p.proximaAcao?.trim()) await store.atualizarTarefa(p.tarefaId, { nextAction: p.proximaAcao.trim() });
}

// ---------------------------------------------------------------- expediente (configuração da gestão)

/** Dias de trabalho, horário de fechamento (fuso America/Sao_Paulo), exceções e critério de "sem atualização". */
export async function salvarExpediente(store: FilaStore, ator: Ator, c: { diasExpediente?: unknown; horarioFechamento?: unknown; excecoes?: unknown; diasSemAtualizacao?: unknown; linksRotina?: unknown }) {
  exigirGestao(ator, "configurar o expediente");
  const patch: Partial<FilaConfig> = {};
  // Expediente só vale completo: ao menos um dia e o horário de fechamento (nada é presumido).
  if (c.diasExpediente !== undefined || c.horarioFechamento !== undefined) {
    if (!Array.isArray(c.diasExpediente) || !c.diasExpediente.length) throw new ErroRegra("Escolha ao menos um dia de expediente.");
    if (typeof c.horarioFechamento !== "string" || !c.horarioFechamento) throw new ErroRegra("Informe o horário de fechamento.");
  }
  if (c.diasExpediente !== undefined) {
    if (c.diasExpediente !== null && !(Array.isArray(c.diasExpediente) && c.diasExpediente.every((d) => Number.isInteger(d) && d >= 0 && d <= 6))) throw new ErroRegra("Dias de expediente inválidos.");
    patch.diasExpediente = c.diasExpediente === null ? null : [...new Set(c.diasExpediente as number[])].sort();
  }
  if (c.horarioFechamento !== undefined) {
    if (c.horarioFechamento !== null && !(typeof c.horarioFechamento === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(c.horarioFechamento))) throw new ErroRegra("Horário de fechamento inválido (HH:MM).");
    patch.horarioFechamento = c.horarioFechamento as string | null;
  }
  if (c.excecoes !== undefined) {
    if (!(Array.isArray(c.excecoes) && c.excecoes.every(isDiaIso))) throw new ErroRegra("Exceções precisam ser datas (AAAA-MM-DD).");
    patch.excecoes = [...new Set(c.excecoes as string[])].sort();
  }
  if (c.diasSemAtualizacao !== undefined) {
    if (!(Number.isInteger(c.diasSemAtualizacao) && (c.diasSemAtualizacao as number) >= 1 && (c.diasSemAtualizacao as number) <= 60)) throw new ErroRegra("“Sem atualização” precisa ser de 1 a 60 dias.");
    patch.diasSemAtualizacao = c.diasSemAtualizacao as number;
  }
  if (c.linksRotina !== undefined) {
    // Links da rotina (ex.: script aprovado de aniversário): só chaves conhecidas e URLs http(s).
    if (!c.linksRotina || typeof c.linksRotina !== "object" || Array.isArray(c.linksRotina)) throw new ErroRegra("Links da rotina inválidos.");
    const links: Record<string, string> = { ...(await store.config()).linksRotina };
    for (const [k, v] of Object.entries(c.linksRotina as Record<string, unknown>)) {
      if (!(CHAVES_LINK_ROTINA as readonly string[]).includes(k)) throw new ErroRegra(`Link de rotina desconhecido: ${k}.`);
      if (v === null || v === "") delete links[k];
      else {
        const l = linkSeguro(v);
        if (!l) throw new ErroRegra("Informe um endereço completo (https://…).");
        links[k] = l;
      }
    }
    patch.linksRotina = links;
  }
  await store.salvarConfig(patch, ator.id);
  await store.auditar({ actor: ator.email, action: "fila_expediente", target: "fila_config", after: patch });
}

/** Tarefas abertas com nome completo e identificadores do Simples Dental (comparação com o feedback anterior). */
export async function tarefasAbertasDetalhadas(store: FilaStore) {
  const tarefas = (await store.tarefasAtivas(hojeSaoPaulo())).filter((t) => !["completed", "cancelled"].includes(t.status));
  const [nomes, pacientes] = await Promise.all([store.nomesPacientes(idsDePacientes(tarefas)), store.pacientes()]);
  const ids = new Map(pacientes.map((p) => [p.id, [p.sd_codigo, p.sd_numero, p.sd_ficha_id].filter((x): x is string => !!x)]));
  return tarefas.map((t) => ({
    id: t.id, ref: refDoItem({ tipo: "tarefa", id: t.id }), paciente: t.patientId ? nomes[t.patientId] ?? "Paciente" : t.assunto ?? "Assunto",
    idsSd: t.patientId ? ids.get(t.patientId) ?? [] : [], tipo: t.kind, titulo: t.title,
  }));
}

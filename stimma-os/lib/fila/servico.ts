import { hashLote, lerLote, type CabecalhoLote, type ItemEntrada } from "./contrato";
import { hojeSaoPaulo, isDiaIso, somarDias } from "./datas";
import { ROTULO_MARCO } from "./marcos";
import { montarFila, type Fila, type ItemFila } from "./agrupamento";
import { montarPrevia, type ItemPrevia } from "./previa";
import { montarFechamento, textoWhatsapp, type Fechamento } from "./fechamento";
import type { FilaStore, MarcoRow, NumerosDoDia, TarefaRow, TipoEvento, TipoTarefa } from "./store";

/**
 * Regras de negócio da fila. Os Route Handlers só autenticam e chamam daqui; o mesmo código
 * roda contra o Supabase (produção) e contra a store em memória (testes e demonstração).
 */
export interface Ator {
  id: string;
  email: string;
  /** Gestão: cola a entrada e anula lançamentos. Concierge: trabalha a fila. */
  gestao: boolean;
}

export class ErroRegra extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export const HORIZONTE_PROXIMAS_DIAS = 30;

function diaSP(iso: string): string {
  return hojeSaoPaulo(new Date(iso));
}

// ---------------------------------------------------------------- entrada

export interface ResultadoPrevia {
  cabecalho: CabecalhoLote;
  hash: string;
  jaImportado: boolean;
  previa: ItemPrevia[];
  pacientes: { id: string; nome: string }[];
}

export async function previaEntrada(store: FilaStore, texto: string): Promise<ResultadoPrevia> {
  const lido = lerLote(texto);
  if (!lido.ok) throw new ErroRegra(lido.erro);
  const hash = hashLote(texto);
  const pacientes = await store.pacientes();
  const chaves = lido.itens.map((i) => i.item?.chave_origem).filter((c): c is string => !!c);
  const registros = await store.registrosPorChave(chaves);
  const atendimentos = await store.atendimentosDe(pacientes.map((p) => p.id));
  const previa = montarPrevia(lido.itens, { pacientes, registros, atendimentos });
  const citados = new Set(previa.flatMap((p) => [...p.sugestoes, ...(p.pacienteId ? [p.pacienteId] : [])]));
  return {
    cabecalho: lido.cabecalho,
    hash,
    jaImportado: await store.loteExiste(hash),
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
}

const TITULO_TAREFA: Record<Exclude<ItemEntrada["tipo"], "atendimento_realizado">, string> = {
  cobranca: "Cobrança",
  recuperacao_falta: "Recuperar falta/cancelamento",
  continuidade: "Continuidade de tratamento",
  relacionamento: "Relacionamento",
  encaminhamento: "Encaminhamento",
};

function dadosTarefa(it: ItemEntrada, hoje: string) {
  const d = it.dados;
  const tipo = it.tipo as Exclude<ItemEntrada["tipo"], "atendimento_realizado">;
  const extra =
    tipo === "cobranca" ? (typeof d.descricao === "string" ? d.descricao : "") :
    tipo === "recuperacao_falta" ? `${d.ocorrencia} em ${d.data_ocorrencia}` :
    tipo === "continuidade" ? String(d.contexto ?? "") :
    tipo === "relacionamento" ? String(d.subtipo ?? "") :
    tipo === "encaminhamento" ? `para ${d.para}: ${d.motivo}` : "";
  const prazo = typeof d.prazo === "string" && isDiaIso(d.prazo) ? d.prazo : null;
  const venc = tipo === "cobranca" && typeof d.vencimento === "string" && isDiaIso(d.vencimento) ? d.vencimento : null;
  return {
    kind: tipo as TipoTarefa,
    title: extra ? `${TITULO_TAREFA[tipo]} — ${extra}` : TITULO_TAREFA[tipo],
    due: prazo ?? venc ?? hoje, // cobrança vencida entra com a data real: aparece como atrasada
    financialImpact: tipo === "cobranca" && typeof d.valor === "number" ? d.valor : null,
    payload: { ...d, ...(it.nota_ia ? { nota_ia: it.nota_ia } : {}), origem: it.origem, consultado_em: it.consultado_em },
  };
}

export async function confirmarEntrada(store: FilaStore, ator: Ator, texto: string, resolucoes: Record<number, Resolucao> = {}): Promise<ResultadoEntrada> {
  if (!ator.gestao) throw new ErroRegra("Só a gestão pode lançar entradas.", 403);
  const p = await previaEntrada(store, texto);
  if (p.jaImportado) throw new ErroRegra("Este lote já foi importado (mesmo conteúdo). Nada foi alterado.", 409);
  const hoje = hojeSaoPaulo();
  const idsValidos = new Set((await store.pacientes()).map((x) => x.id));
  const criadosPorIdSd = new Map<string, string>();
  const res: ResultadoEntrada = { loteId: "", aplicados: 0, atendimentosConfirmados: 0, atendimentosPendentes: 0, tarefas: 0, naoAplicados: [] };
  const registroItens: Parameters<FilaStore["criarLote"]>[0]["itens"] = [];

  for (const item of p.previa) {
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

    registroItens.push({ index: item.index, tipo: item.item?.tipo ?? "invalido", chaveOrigem: item.item?.chave_origem, resultado: item.classificacao, payload: { item: item.item, erros: item.erros, avisos: item.avisos }, resolution: r ?? (aplicar ? { acao: "automatico" } : null) });
    if (!aplicar || !item.item) {
      res.naoAplicados.push({ index: item.index, classificacao: item.classificacao, motivo: r?.acao === "ignorar" ? "ignorado pela gestão" : item.motivo });
      continue;
    }

    const it = item.item;
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
      const t = dadosTarefa(it, hoje);
      const existente = it.chave_origem ? await store.tarefaPorChave(it.chave_origem) : null;
      if (existente) await store.atualizarTarefaEntrada(existente.id, { title: t.title, aConferir: it.a_conferir, payload: t.payload, financialImpact: t.financialImpact });
      else await store.criarTarefa({ ...t, patientId: pacienteId, chaveOrigem: it.chave_origem ?? null, aConferir: it.a_conferir, origem: it.origem, origemData: it.consultado_em.slice(0, 10) });
      res.tarefas++;
    }
    res.aplicados++;
  }

  res.loteId = await store.criarLote({ hash: p.hash, origem: p.cabecalho.origem, consultadoEm: p.cabecalho.consultado_em, criadoPor: ator.id, itens: registroItens });
  await store.auditar({ actor: ator.email, action: "fila_entrada_confirmada", target: `import_batches/${res.loteId}`, after: { aplicados: res.aplicados, naoAplicados: res.naoAplicados.length } });
  return res;
}

// ---------------------------------------------------------------- atendimentos

export async function confirmarAtendimentoPendente(store: FilaStore, ator: Ator, id: string, data: string) {
  if (!isDiaIso(data)) throw new ErroRegra("Informe a data exata do atendimento.");
  if (data > hojeSaoPaulo()) throw new ErroRegra("A data do atendimento não pode estar no futuro.");
  const a = await store.atendimento(id);
  if (!a) throw new ErroRegra("Atendimento não encontrado.", 404);
  if (a.anulado) throw new ErroRegra("Atendimento anulado não pode ser confirmado.");
  await store.confirmarAtendimento(id, data, ator.id);
  await store.auditar({ actor: ator.email, action: "fila_atendimento_confirmado", target: `appointments/${id}`, before: { data: a.dataRealizada, status: a.dataStatus }, after: { data } });
}

export async function anularAtendimento(store: FilaStore, ator: Ator, id: string, motivo: string) {
  if (!ator.gestao) throw new ErroRegra("Só a gestão pode anular um atendimento.", 403);
  if (!motivo.trim()) throw new ErroRegra("O motivo da anulação é obrigatório.");
  const a = await store.atendimento(id);
  if (!a || a.anulado) throw new ErroRegra("Atendimento inexistente ou já anulado.", 404);
  await store.anularAtendimento(id, motivo.trim(), ator.id);
  await store.auditar({ actor: ator.email, action: "fila_atendimento_anulado", target: `appointments/${id}`, reason: motivo.trim() });
}

// ---------------------------------------------------------------- ações na fila

export type Acao = "contato" | "resposta" | "adiar" | "agendamento" | "recebimento" | "encerrar";

export interface EntradaAcao {
  eventoId: string;
  alvos: { tipo: "marco" | "tarefa"; id: string }[];
  acao: Acao;
  data?: string;
  canal?: string;
  notas?: string;
  novaData?: string;
  agendadoPara?: string;
  valor?: number;
  origemValor?: string;
  motivo?: string;
  desfecho?: "contemplado" | "dispensado";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENTO_DA_ACAO: Record<Acao, TipoEvento> = { contato: "contato", resposta: "resposta", adiar: "adiamento", agendamento: "agendamento_obtido", recebimento: "recebimento_confirmado", encerrar: "encerramento" };

export async function registrarAcao(store: FilaStore, ator: Ator, e: EntradaAcao): Promise<{ duplicado: boolean }> {
  if (!UUID.test(e.eventoId)) throw new ErroRegra("eventoId inválido.");
  if (await store.eventoExiste(e.eventoId)) return { duplicado: true }; // reenvio (duplo clique, rede): não duplica
  if (!e.alvos.length) throw new ErroRegra("Escolha ao menos um item.");
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

  const precisaNovaData = e.acao === "adiar" || e.acao === "resposta";
  if (precisaNovaData && (!e.novaData || !isDiaIso(e.novaData) || e.novaData < hoje)) throw new ErroRegra("Informe a data do próximo passo (hoje ou depois).");
  if (e.acao === "adiar" && !e.motivo?.trim()) throw new ErroRegra("Adiar exige motivo.");
  if (e.acao === "contato" && e.novaData && (!isDiaIso(e.novaData) || e.novaData < hoje)) throw new ErroRegra("Data de nova tentativa inválida.");
  if (e.acao === "agendamento" && (!e.agendadoPara || !isDiaIso(e.agendadoPara))) throw new ErroRegra("Informe a data da consulta agendada.");
  if (e.acao === "recebimento") {
    if (marcos.length || tarefas.some((t) => t.kind !== "cobranca")) throw new ErroRegra("Recebimento só se registra em itens de cobrança.");
    if (!(typeof e.valor === "number" && e.valor > 0)) throw new ErroRegra("Informe o valor recebido.");
    if (!e.origemValor) throw new ErroRegra("Informe a origem do valor (parcela, dívida antiga, nova contratação…).");
  }
  if (e.acao === "encerrar" && (!e.motivo?.trim() || !e.desfecho)) throw new ErroRegra("Encerrar exige desfecho e motivo.");

  await store.registrarEvento({
    id: e.eventoId, patientId, kind: EVENTO_DA_ACAO[e.acao], occurredOn: data, channel: e.canal ?? null,
    notes: [e.notas?.trim(), e.motivo?.trim()].filter(Boolean).join(" — ") || null,
    amount: e.acao === "recebimento" ? e.valor! : null, amountOrigin: e.acao === "recebimento" ? e.origemValor! : null,
    scheduledFor: e.acao === "agendamento" ? e.agendadoPara! : null, createdBy: ator.id,
    alvos: [...marcos.map((m) => ({ marcoId: m.id })), ...tarefas.map((t) => ({ tarefaId: t.id }))],
  });

  for (const m of marcos) {
    if (e.acao === "contato") await store.atualizarMarco(m.id, e.novaData ? { status: "previsto", dueCurrent: e.novaData } : { status: "contatado" });
    if (precisaNovaData) await store.atualizarMarco(m.id, { status: "previsto", dueCurrent: e.novaData! });
    if (e.acao === "agendamento") await store.atualizarMarco(m.id, { status: "contemplado", statusReason: `agendado para ${e.agendadoPara}` });
    if (e.acao === "encerrar") await store.atualizarMarco(m.id, { status: e.desfecho!, statusReason: e.motivo!.trim() });
  }
  for (const t of tarefas) {
    if (e.acao === "contato") await store.atualizarTarefa(t.id, e.novaData ? { status: "open", due: e.novaData } : { status: "waiting", waiting: true });
    if (precisaNovaData) await store.atualizarTarefa(t.id, { status: "open", due: e.novaData! });
    if (e.acao === "agendamento") await store.atualizarTarefa(t.id, { status: "completed", closedReason: "agendamento_obtido" });
    if (e.acao === "recebimento") await store.atualizarTarefa(t.id, { status: "completed", closedReason: "recebimento_confirmado" });
    if (e.acao === "encerrar") await store.atualizarTarefa(t.id, { status: e.desfecho === "contemplado" ? "completed" : "cancelled", closedReason: e.motivo!.trim() });
  }
  await store.auditar({ actor: ator.email, action: `fila_${e.acao}`, target: `patients/${patientId}`, after: { evento: e.eventoId, alvos: e.alvos } });
  return { duplicado: false };
}

// ---------------------------------------------------------------- leitura da fila

export interface FilaCarregada {
  hoje: string;
  fila: Fila;
  maisTarde: number;
}

export async function carregarFila(store: FilaStore, hoje = hojeSaoPaulo()): Promise<FilaCarregada> {
  const desde = somarDias(hoje, -1);
  const [marcos, tarefas, pendentes] = await Promise.all([store.marcosAtivos(desde), store.tarefasAtivas(desde), store.atendimentosPendentes()]);
  const nomes = await store.nomesPacientes([...new Set([...marcos, ...tarefas, ...pendentes].map((r) => r.patientId))]);
  const nome = (id: string) => nomes[id] ?? "Paciente";

  const itens: ItemFila[] = [
    ...marcos.map((m): ItemFila => ({
      id: `marco:${m.id}`, alvo: { tipo: "marco", id: m.id }, pacienteId: m.patientId, pacienteNome: nome(m.patientId), tipo: "marco",
      titulo: `Acompanhamento de ${ROTULO_MARCO[m.kind]}`,
      detalhe: m.dueCurrent !== m.dueOriginal ? `previsto para ${m.dueOriginal}, adiado` : undefined,
      status: m.status === "previsto" ? "aberta" : m.status === "contatado" ? "aguardando" : "concluida",
      due: m.dueCurrent, concluidaEm: ["contemplado", "dispensado"].includes(m.status) ? diaSP(m.updatedAt) : undefined,
    })),
    ...tarefas.map((t): ItemFila => ({
      id: `tarefa:${t.id}`, alvo: { tipo: "tarefa", id: t.id }, pacienteId: t.patientId, pacienteNome: nome(t.patientId), tipo: t.kind,
      titulo: t.title, aConferir: t.aConferir, valor: t.financialImpact ?? undefined,
      status: t.status === "waiting" ? "aguardando" : ["completed", "cancelled"].includes(t.status) ? "concluida" : "aberta",
      due: t.due, concluidaEm: ["completed", "cancelled"].includes(t.status) ? diaSP(t.updatedAt) : undefined,
    })),
    ...pendentes.map((a): ItemFila => ({
      id: `atendimento:${a.id}`, alvo: { tipo: "atendimento", id: a.id }, pacienteId: a.patientId, pacienteNome: nome(a.patientId), tipo: "conferir_atendimento",
      titulo: "Conferir atendimento no Simples Dental", detalhe: a.dataRealizada ? `data informada: ${a.dataRealizada}` : undefined,
      status: "aberta", due: diaSP(a.createdAt),
    })),
  ];
  const limite = somarDias(hoje, HORIZONTE_PROXIMAS_DIAS);
  const visiveis = itens.filter((i) => i.status !== "aberta" || i.due <= limite);
  return { hoje, fila: montarFila(visiveis, hoje), maisTarde: itens.length - visiveis.length };
}

// ---------------------------------------------------------------- fechamento

export async function carregarFechamento(store: FilaStore, dia = hojeSaoPaulo()): Promise<{ fechamento: Fechamento; texto: string }> {
  if (!isDiaIso(dia)) throw new ErroRegra("Dia inválido.");
  const [eventos, numeros, { fila }] = await Promise.all([store.eventosDoDia(dia), store.numerosDoDia(dia), carregarFila(store, dia)]);
  const nomes = await store.nomesPacientes([...new Set(eventos.map((e) => e.patientId))]);
  const fechamento = montarFechamento(dia, eventos, fila, nomes, numeros);
  return { fechamento, texto: textoWhatsapp(fechamento) };
}

export async function salvarNumeros(store: FilaStore, ator: Ator, dia: string, n: NumerosDoDia) {
  if (!isDiaIso(dia) || dia > hojeSaoPaulo()) throw new ErroRegra("Dia inválido.");
  for (const v of [n.agendaPrevista, n.agendaRealizada, n.caixaPrevisto, n.caixaRecebido]) {
    if (v !== null && !(typeof v === "number" && v >= 0 && Number.isFinite(v))) throw new ErroRegra("Os números precisam ser positivos.");
  }
  await store.salvarNumeros(dia, { ...n, caixaSituacao: n.caixaSituacao?.trim() || null }, ator.id);
  await store.auditar({ actor: ator.email, action: "fila_numeros_do_dia", target: `daily_manual_figures/${dia}`, after: n });
}

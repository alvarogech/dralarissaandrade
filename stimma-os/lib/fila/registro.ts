import type { PacienteRef } from "./contrato";
import { hojeSaoPaulo, isDiaIso, somarDias } from "./datas";
import { JANELA_MARCOS_DIAS } from "./trabalho";
import { ErroRegra, type Ator } from "./servico";
import { assuntoDoEvento } from "./assunto";
import { CATEGORIAS, type Categoria, type FilaStore, type MarcoRow, type SimNao, type TarefaRow, type TipoEvento, type TipoTarefa } from "./store";

/**
 * Registro do dia da concierge — um formulário só para (a) registrar o que aconteceu numa tarefa
 * existente e (b) registrar algo que surgiu no expediente sem tarefa prévia. O mesmo evento
 * alimenta a fila, o histórico, os contadores e o feedback.
 *
 * Separa três coisas que não podem se confundir:
 *  - a AÇÃO de hoje (o que foi feito; contato sim/não/não se aplica — null = não preenchido);
 *  - o RESULTADO de hoje (houve resposta? o quê?);
 *  - a SITUAÇÃO do caso depois do registro (aguardando, pendente, agendado, resolvido…).
 * Contato feito não encerra o caso; agendado não é atendido; informativo não cria tarefa.
 */
export const SITUACOES = ["aguardando", "pendente", "aguardando_gestao", "agendado", "compareceu", "faltou", "encaminhado", "resolvido", "dispensado", "informativo"] as const;
export type SituacaoRegistro = (typeof SITUACOES)[number];

/** Situações que deixam o caso aberto e por isso exigem próxima ação, responsável e prazo de revisão. */
export const SITUACOES_COM_PENDENCIA: readonly SituacaoRegistro[] = ["aguardando", "pendente", "aguardando_gestao", "encaminhado"];

export const RESPONSAVEIS_EXTERNOS = { comercial_externa: "Comercial Externa", dra_larissa: "Dra. Larissa", gestao: "Gestão" } as const;

export interface EtapaClinica {
  /** Definição informada pela Dra. Larissa (texto livre; o sistema não sugere tratamento). */
  definicao?: string;
  situacao?: "a_definir" | "prevista" | "agendada" | "realizada" | "adiada" | "encerrada";
  data?: string;
  motivo?: string;
}

export interface EntradaRegistro {
  eventoId: string;
  /** Vazio = registro espontâneo (sem tarefa prévia). */
  alvos: { tipo: "marco" | "tarefa"; id: string }[];
  categoria: Categoria;
  pacienteId?: string | null;
  novoPaciente?: PacienteRef;
  /** Assunto sem paciente (só pendências/alertas e pontos da agenda). */
  assunto?: string;
  contexto?: string;
  feito?: string;
  contato: SimNao | null;
  canal?: string;
  resposta: SimNao | null;
  resultado?: string;
  situacao: SituacaoRegistro;
  proximaAcao?: string;
  /** "perfil:<uuid>" | comercial_externa | dra_larissa | gestao */
  responsavel?: string;
  prazo?: string;
  agendadoPara?: string;
  motivo?: string;
  /** Campos específicos do tipo (ocorrência, horário, interesse, último atendimento aproximado…). */
  detalhes?: Record<string, string>;
  etapa?: EtapaClinica;
  /** Reclamação ou pedido de avaliação: vira ponto de atenção (sem interpretação clínica). */
  atencao?: boolean;
  data?: string;
  /** Aguardando gestão: a dúvida ou o impedimento que a gestão precisa responder. */
  pergunta?: string;
  /** Marcos além da janela de trabalho incluídos no mesmo registro: exige justificativa. */
  justificativaFuturos?: string;
}

/** Janela em que o mesmo marco para a mesma paciente conta como repetição (dias). */
export const JANELA_MARCO_REPETIDO = 25;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dataBr = (iso: string) => iso.split("-").reverse().join("/");
const limpo = (v?: string | null) => (typeof v === "string" && v.trim() ? v.trim() : null);

const KIND_DA_CATEGORIA: Record<Categoria, TipoTarefa> = {
  agenda: "agenda", oportunidade: "oportunidade", recorrencia: "recorrencia", continuidade: "continuidade",
  pos_atendimento: "pos_atendimento", relacionamento: "relacionamento", pendencia: "pendencia", encaminhamento: "encaminhamento",
};

/** Categoria (bloco do feedback) de uma tarefa já existente. */
export function categoriaDaTarefa(t: { kind: string; payload: Record<string, unknown> }): Categoria {
  if (typeof t.payload.categoria === "string" && (CATEGORIAS as readonly string[]).includes(t.payload.categoria)) return t.payload.categoria as Categoria;
  if (t.payload.subtipo === "comparecimento") return "agenda";
  switch (t.kind) {
    case "recuperacao_falta": case "agenda": return "agenda";
    case "oportunidade": return "oportunidade";
    case "recorrencia": return "recorrencia";
    case "continuidade": return "continuidade";
    case "pos_atendimento": return "pos_atendimento";
    case "relacionamento": return "relacionamento";
    case "encaminhamento": return "encaminhamento";
    default: return "pendencia";
  }
}

function tipoEvento(e: EntradaRegistro): TipoEvento {
  switch (e.situacao) {
    case "agendado": return "agendamento_obtido";
    case "compareceu": return "atendimento_realizado";
    case "faltou": return "cancelamento";
    case "resolvido": case "dispensado": return "encerramento";
    case "encaminhado": case "aguardando_gestao": return "encaminhamento";
  }
  if (e.contato === "sim") return "contato";
  if (e.resposta === "sim") return "resposta";
  return "registro";
}

export function rotuloResponsavel(r: string | undefined, perfis: { id: string; nome: string }[]): string | null {
  if (!r) return null;
  if (r.startsWith("perfil:")) return perfis.find((p) => p.id === r.slice(7))?.nome ?? null;
  return (RESPONSAVEIS_EXTERNOS as Record<string, string>)[r] ?? null;
}

export async function registrarAtividade(store: FilaStore, ator: Ator, e: EntradaRegistro): Promise<{ duplicado: boolean; tarefaCriada: string | null }> {
  if (!UUID.test(e.eventoId)) throw new ErroRegra("eventoId inválido.");
  if (await store.eventoExiste(e.eventoId)) return { duplicado: true, tarefaCriada: null }; // duplo clique / reenvio
  if (!(CATEGORIAS as readonly string[]).includes(e.categoria)) throw new ErroRegra("Tipo de acompanhamento inválido.");
  if (!(SITUACOES as readonly string[]).includes(e.situacao)) throw new ErroRegra("Informe a situação atual.");
  for (const v of [e.contato, e.resposta]) if (v !== null && v !== "sim" && v !== "nao" && v !== "na") throw new ErroRegra("Contato e resposta: sim, não ou não se aplica.");
  const hoje = hojeSaoPaulo();
  const data = e.data ?? hoje;
  if (!isDiaIso(data) || data > hoje) throw new ErroRegra("A data do registro precisa ser hoje ou um dia anterior.");
  if (e.resposta === "sim" && !limpo(e.resultado)) throw new ErroRegra("Houve resposta: descreva o resultado em poucas palavras.");

  const perfis = await store.perfis();
  const config = await store.config();
  // Encaminhar à gestão ou pedir orientação: a próxima ação passa a ser da gestão (nunca fica com a Gabi por padrão).
  const paraGestao = e.situacao === "aguardando_gestao" || (e.situacao === "encaminhado" && (e.responsavel === "gestao" || /gest/i.test(e.detalhes?.para ?? "")));
  if (paraGestao) {
    if (!config.gestorId) throw new ErroRegra("Gestor não configurado: não há para quem encaminhar. Avise a administração.");
    if (e.situacao === "aguardando_gestao" && !limpo(e.pergunta)) throw new ErroRegra("Aguardando gestão: escreva a dúvida ou o impedimento.");
    e = { ...e, responsavel: `perfil:${config.gestorId}`, proximaAcao: limpo(e.proximaAcao) ?? (limpo(e.pergunta) ? `Responder: ${limpo(e.pergunta)}` : limpo(e.detalhes?.motivo_encaminhamento) ? `Avaliar encaminhamento: ${limpo(e.detalhes?.motivo_encaminhamento)}` : undefined) };
  }
  const pendente = SITUACOES_COM_PENDENCIA.includes(e.situacao);
  const proxima = limpo(e.proximaAcao);
  if (pendente) {
    if (!proxima) throw new ErroRegra("Caso pendente: informe a próxima ação.");
    if (!rotuloResponsavel(e.responsavel, perfis)) throw new ErroRegra("Caso pendente: escolha o responsável.");
    if (!e.prazo || !isDiaIso(e.prazo) || e.prazo < hoje) throw new ErroRegra("Caso pendente: informe o prazo (hoje ou depois).");
  }
  if (e.situacao === "agendado" && (!e.agendadoPara || !isDiaIso(e.agendadoPara))) throw new ErroRegra("Informe a data da consulta agendada.");
  if (e.situacao === "dispensado" && !limpo(e.motivo)) throw new ErroRegra("Encerrar sem resolver exige motivo.");
  if (e.situacao === "resolvido") {
    // Resolução exige resultado coerente: mensagem sem resposta não resolve nada.
    if (e.contato === "sim" && e.resposta === "nao") throw new ErroRegra("Mensagem sem resposta não resolve o caso: use “Aguardando paciente” com data de revisão.");
    if (!limpo(e.resultado) && !limpo(e.feito)) throw new ErroRegra("Resolvido: descreva o resultado alcançado.");
  }
  if (e.etapa?.data && !isDiaIso(e.etapa.data)) throw new ErroRegra("Data da etapa clínica inválida.");
  if ((e.etapa?.situacao === "adiada" || e.etapa?.situacao === "encerrada") && !limpo(e.etapa.motivo)) throw new ErroRegra("Etapa adiada ou encerrada: informe o motivo.");

  // ---- alvos (caso existente) ou registro espontâneo
  const marcos: MarcoRow[] = [];
  const tarefas: TarefaRow[] = [];
  for (const a of e.alvos ?? []) {
    const row = a.tipo === "marco" ? await store.marco(a.id) : await store.tarefa(a.id);
    if (!row) throw new ErroRegra("Item não encontrado.", 404);
    const fechado = a.tipo === "marco" ? !["previsto", "contatado"].includes((row as MarcoRow).status) : ["completed", "cancelled"].includes((row as TarefaRow).status);
    if (fechado) throw new ErroRegra("Um dos itens já foi encerrado.");
    if (a.tipo === "marco") marcos.push(row as MarcoRow);
    else tarefas.push(row as TarefaRow);
  }
  if ((e.situacao === "compareceu" || e.situacao === "faltou") && (marcos.length || !tarefas.length || tarefas.some((t) => t.payload.subtipo !== "comparecimento"))) {
    throw new ErroRegra("Comparecimento ou falta se registra na tarefa de confirmar comparecimento.");
  }
  // Cobrança enviada não é pagamento: só resolve com confirmação explícita do pagamento.
  if (e.situacao === "resolvido" && tarefas.some((t) => t.kind === "cobranca") && e.detalhes?.pagamento_confirmado !== "sim") {
    throw new ErroRegra("Cobrança só é resolvida com o pagamento confirmado. Enviar a cobrança é uma ação: use “Aguardando paciente”.");
  }
  // Registro agrupado: marcos fora da janela de trabalho só entram com justificativa explícita.
  const limiteJanela = somarDias(hoje, JANELA_MARCOS_DIAS);
  const futuros = marcos.filter((m) => m.dueCurrent > limiteJanela);
  if (futuros.length && !limpo(e.justificativaFuturos)) {
    throw new ErroRegra(`Há ${futuros.length} marco(s) previsto(s) para depois de ${dataBr(limiteJanela)} neste registro: justifique a antecipação ou desmarque.`);
  }
  // Adiamento (empurrar o prazo sem contato nem resposta): exige motivo e preserva o prazo original.
  const adiadas = pendente && e.prazo ? tarefas.filter((t) => e.prazo! > t.due && e.contato !== "sim" && e.resposta !== "sim" && !paraGestao) : [];
  if (adiadas.length && !limpo(e.motivo)) throw new ErroRegra("Adiar o prazo sem contato exige motivo.");

  let patientId: string | null = null;
  let assunto: string | null = null;
  if (marcos.length || tarefas.length) {
    const chaves = new Set([...marcos.map((m) => m.patientId), ...tarefas.map((t) => t.patientId ?? `assunto:${t.id}`)]);
    if (chaves.size !== 1) throw new ErroRegra("Um registro só vale para itens da mesma paciente.");
    patientId = marcos[0]?.patientId ?? tarefas[0]?.patientId ?? null;
    assunto = patientId ? null : assuntoDoEvento(tarefas[0]);
  } else if (e.pacienteId) {
    const nomes = await store.nomesPacientes([e.pacienteId]);
    if (!nomes[e.pacienteId]) throw new ErroRegra("Paciente não encontrada.", 404);
    patientId = e.pacienteId;
  } else if (limpo(e.novoPaciente?.nome)) {
    // Cadastro explícito de quem ainda não está no sistema — nunca unido a outra por nome.
    patientId = await store.criarPaciente({ ...e.novoPaciente, nome: limpo(e.novoPaciente!.nome)! }, ator.id);
    await store.auditar({ actor: ator.email, action: "fila_paciente_criada", target: `patients/${patientId}`, after: { nome: e.novoPaciente!.nome, origem: "registro do dia" } });
  } else if (limpo(e.assunto) && (e.categoria === "pendencia" || e.categoria === "agenda")) {
    assunto = limpo(e.assunto);
  } else {
    throw new ErroRegra(e.categoria === "pendencia" || e.categoria === "agenda" ? "Escolha a paciente ou descreva o assunto." : "Escolha a paciente.");
  }
  if (!marcos.length && !tarefas.length && e.situacao === "informativo" && !limpo(e.feito) && !limpo(e.resultado) && !limpo(e.contexto)) {
    throw new ErroRegra("Descreva o que foi registrado.");
  }

  // Marco de acompanhamento (15/30/60/90 dias) já registrado para a mesma paciente há pouco:
  // só repete com motivo — evita cobrar ou contatar duas vezes pelo mesmo marco.
  const marco = limpo(e.detalhes?.marco);
  if (marco && patientId && !limpo(e.detalhes?.justificativa_repeticao)) {
    const anterior = (await store.eventosRecentesDoPaciente(patientId, somarDias(hoje, -JANELA_MARCO_REPETIDO)))
      .find((x) => (x.payload?.detalhes as Record<string, unknown> | undefined)?.marco === marco);
    if (anterior) throw new ErroRegra(`Esta paciente já teve o acompanhamento de ${marco} registrado em ${dataBr(anterior.occurredOn)}. Se precisar repetir, informe o motivo.`, 409);
  }

  const respRotulo = rotuloResponsavel(e.responsavel, perfis);
  const assignedTo = e.responsavel?.startsWith("perfil:") ? e.responsavel.slice(7) : null;
  const payloadExtra: Record<string, unknown> = {
    categoria: e.categoria,
    ...(limpo(e.contexto) ? { contexto: limpo(e.contexto) } : {}),
    ...(e.detalhes && Object.keys(e.detalhes).length ? { detalhes: e.detalhes } : {}),
    ...(e.etapa && Object.values(e.etapa).some(Boolean) ? { etapa: e.etapa } : {}),
    ...(e.atencao ? { atencao: true } : {}),
    ...(e.responsavel && !assignedTo ? { responsavel: e.responsavel } : {}),
  };
  const aguardando: "paciente" | "gestao" | null = paraGestao ? "gestao" : e.situacao === "aguardando" ? "paciente" : null;

  // ---- registro espontâneo com pendência vira um caso (tarefa) — sem pendência, só o evento
  let tarefaCriada: string | null = null;
  if (!marcos.length && !tarefas.length && pendente) {
    const chave = `registro:${e.eventoId}`;
    tarefaCriada = (await store.tarefaPorChave(chave))?.id ?? (await store.criarTarefa({
      patientId, assunto, kind: e.categoria === "agenda" && /falta|cancel/i.test(e.detalhes?.ocorrencia ?? "") ? "recuperacao_falta" : KIND_DA_CATEGORIA[e.categoria], title: proxima!, chaveOrigem: chave, due: e.prazo!, aConferir: [],
      payload: payloadExtra, financialImpact: null, origem: "registro do dia", origemData: data, assignedTo, nextAction: proxima,
    }));
    if (e.situacao !== "pendente") await store.atualizarTarefa(tarefaCriada, { status: "waiting", waiting: true, aguardando });
  }

  // ---- evento (fonte única para histórico, contadores e feedback)
  const resumo = [limpo(e.feito), e.resposta === "sim" ? `resposta: ${limpo(e.resultado)}` : null, limpo(e.pergunta) ? `dúvida para a gestão: ${limpo(e.pergunta)}` : null, limpo(e.motivo),
    proxima && pendente ? `próxima ação: ${proxima}${respRotulo ? ` (${respRotulo})` : ""} até ${dataBr(e.prazo!)}` : null].filter(Boolean).join(" — ") || null;
  await store.registrarEvento({
    id: e.eventoId, patientId, assunto, kind: tipoEvento(e), occurredOn: data, channel: e.contato === "sim" ? limpo(e.canal) : null,
    notes: resumo, amount: null, amountOrigin: null, scheduledFor: e.situacao === "agendado" ? e.agendadoPara! : null, createdBy: ator.id,
    categoria: e.categoria, contato: e.contato, resposta: e.resposta, resultado: limpo(e.resultado), situacao: e.situacao,
    payload: {
      ...payloadExtra, ...(limpo(e.feito) ? { feito: limpo(e.feito) } : {}), ...(proxima ? { proxima, prazo: e.prazo, responsavel: respRotulo } : {}),
      ...(limpo(e.pergunta) ? { pergunta: limpo(e.pergunta) } : {}), ...(limpo(e.justificativaFuturos) ? { justificativa_futuros: limpo(e.justificativaFuturos) } : {}),
      ...(adiadas.length ? { adiamento: adiadas.map((t) => ({ tarefa: t.id, de: t.due, para: e.prazo })) } : {}),
    },
    alvos: [...marcos.map((m) => ({ marcoId: m.id })), ...tarefas.map((t) => ({ tarefaId: t.id })), ...(tarefaCriada ? [{ tarefaId: tarefaCriada }] : [])],
  });

  // ---- atualiza o caso existente conforme a situação (histórico preservado nos eventos)
  for (const m of marcos) {
    if (e.situacao === "aguardando" || e.situacao === "encaminhado" || e.situacao === "aguardando_gestao") await store.atualizarMarco(m.id, { status: "contatado", statusReason: proxima, dueCurrent: e.prazo });
    if (e.situacao === "pendente") await store.atualizarMarco(m.id, { status: "previsto", statusReason: proxima, dueCurrent: e.prazo });
    if (e.situacao === "agendado") await store.atualizarMarco(m.id, { status: "contemplado", statusReason: `agendado para ${dataBr(e.agendadoPara!)}` });
    if (e.situacao === "resolvido") await store.atualizarMarco(m.id, { status: "contemplado", statusReason: limpo(e.resultado) ?? limpo(e.feito) ?? "resolvido" });
    if (e.situacao === "dispensado") await store.atualizarMarco(m.id, { status: "dispensado", statusReason: limpo(e.motivo) });
  }
  for (const t of tarefas) {
    const payload = { ...t.payload, ...payloadExtra, categoria: t.payload.categoria ?? payloadExtra.categoria };
    const adiamento = adiadas.includes(t) ? { prazoOriginal: t.prazoOriginal ?? t.due, adiamentos: (t.adiamentos ?? 0) + 1 } : {};
    if (e.situacao === "aguardando" || e.situacao === "encaminhado" || e.situacao === "aguardando_gestao") {
      // Encaminhamento externo (Comercial, Dra.) segue aberto sob responsabilidade nomeada; não encerra o caso.
      await store.atualizarTarefa(t.id, { status: "waiting", waiting: true, due: e.prazo, nextAction: proxima, assignedTo: assignedTo ?? t.assignedTo, payload, aguardando: aguardando ?? "paciente", ...adiamento });
    } else if (e.situacao === "pendente") await store.atualizarTarefa(t.id, { status: "open", due: e.prazo, nextAction: proxima, assignedTo: assignedTo ?? t.assignedTo, payload, aguardando: null, ...adiamento });
    else if (e.situacao === "agendado") await store.atualizarTarefa(t.id, { status: "completed", closedReason: `agendamento obtido para ${dataBr(e.agendadoPara!)}`, payload });
    else if (e.situacao === "resolvido") await store.atualizarTarefa(t.id, { status: "completed", closedReason: limpo(e.resultado) ?? limpo(e.feito) ?? "resolvido", payload });
    else if (e.situacao === "dispensado") await store.atualizarTarefa(t.id, { status: "cancelled", closedReason: limpo(e.motivo), payload });
    else if (e.situacao === "compareceu" || e.situacao === "faltou") await store.atualizarTarefa(t.id, { status: "completed", closedReason: e.situacao === "compareceu" ? "compareceu" : "faltou", payload });
    else if (Object.keys(payloadExtra).length > 1) await store.atualizarTarefa(t.id, { payload }); // informativo: só contexto/etapa
  }

  // ---- continuidade automática
  if (e.situacao === "agendado" && patientId) {
    // Agendado ≠ atendido: segue em acompanhamento até confirmar comparecimento na data.
    const chave = `comparecimento:${e.eventoId}`;
    if (!(await store.tarefaPorChave(chave))) {
      await store.criarTarefa({
        patientId, kind: "agenda", title: `Confirmar comparecimento — consulta de ${dataBr(e.agendadoPara!)}`, chaveOrigem: chave,
        due: e.agendadoPara!, aConferir: [], payload: { subtipo: "comparecimento", categoria: "agenda", agendado_para: e.agendadoPara, evento_origem: e.eventoId },
        financialImpact: null, origem: "agendamento", origemData: data,
        // Acompanhar o comparecimento continua com quem cuida do caso (ou com a concierge).
        assignedTo: tarefas[0]?.assignedTo ?? config.conciergeId ?? ator.id,
      });
    }
  }
  if ((e.situacao === "compareceu" || e.situacao === "faltou") && patientId) {
    const t = tarefas[0]!;
    const dataConsulta = typeof t.payload.agendado_para === "string" && isDiaIso(t.payload.agendado_para) ? t.payload.agendado_para : data;
    if (e.situacao === "compareceu") {
      // Vira "conferir atendimento": os marcos só nascem quando o realizado for confirmado no Simples Dental.
      if (!(await store.atendimentoPorChave(`comparecimento:${t.id}`))) {
        await store.criarAtendimento({ patientId, chaveOrigem: `comparecimento:${t.id}`, data: dataConsulta <= hoje ? dataConsulta : hoje, dataStatus: "pendente_validacao", consultadoEm: new Date().toISOString(), origem: "concierge_comparecimento" });
      }
    } else if (!(await store.tarefaPorChave(`falta:${t.id}`))) {
      await store.criarTarefa({
        patientId, kind: "recuperacao_falta", title: proxima ?? `Recuperar falta — consulta de ${dataBr(dataConsulta)}`, chaveOrigem: `falta:${t.id}`,
        due: e.prazo && isDiaIso(e.prazo) ? e.prazo : somarDias(hoje, 1), aConferir: [], payload: { categoria: "agenda", ocorrencia: "falta", data_ocorrencia: dataConsulta },
        financialImpact: null, origem: "comparecimento", origemData: data, assignedTo: assignedTo ?? t.assignedTo ?? config.conciergeId, nextAction: proxima,
      });
    }
  }

  await store.auditar({ actor: ator.email, action: `fila_registro_${e.situacao}`, target: patientId ? `patients/${patientId}` : `assunto/${assunto}`, after: { evento: e.eventoId, alvos: e.alvos, categoria: e.categoria } });
  return { duplicado: false, tarefaCriada };
}

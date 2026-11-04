import type { EventoRow } from "./store";

/**
 * Leitura única de um registro do dia (evento) — a regra central do feedback:
 *   Paciente → Motivo → Ação realizada → Resposta → Desfecho → Próximo passo (quando houver).
 *
 * Puro e determinístico. Lê o formato atual e os antigos (eventos gravados antes de 03/11/2026, quando
 * a orientação e a resposta da paciente saíam do mesmo campo "observação"), sem alterar nada no banco:
 * o que falta ou não diz nada aparece como INCOMPLETO, nunca é preenchido por suposição.
 *
 * É a fonte dos indicadores do dia (fechamento, prestação de contas, tela) e das linhas do WhatsApp,
 * para que todas as visões contem a mesma coisa do mesmo jeito.
 */

/** Minúsculas, sem acento, pontuação vira espaço. */
export function normalizarTexto(v: string): string {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Expressões que só repetem o nome do campo ou da ação — não dizem o que aconteceu. Lista curta e
 * explícita (sem interpretar semântica): respostas curtas legítimas ("Tudo bem", "Sem dor",
 * "Não tenho interesse", "Ok") continuam aceitas.
 */
const GENERICOS = new Set([
  "contato", "contato realizado", "contato feito", "contatado", "contatada", "contatei",
  "mensagem", "mensagem enviada", "enviado", "enviada",
  "acompanhamento", "acompanhamento realizado", "acompanhamento feito",
  "orientacao", "orientacao prestada", "orientacao dada", "orientacao feita", "orientada", "orientado", "orientei",
  "resposta", "respondeu", "paciente respondeu", "respondido", "respondida",
  "resolvido", "resolvida", "feito", "feita", "realizado", "realizada", "registrado", "registrada",
  "sim", "nao", "na", "n a", "nao se aplica", "obs", "observacao", "nada", "x",
  "pos procedimento", "contato de pos procedimento", "continuidade", "continuidade de tratamento",
  "retorno", "follow up", "followup",
]);

/**
 * O texto descreve algo? Rejeita vazio, só pontuação/espaços, menos de duas letras ou números, as
 * expressões genéricas acima e, no contexto, o próprio rótulo da ação/atividade (`proibidos`).
 */
export function textoSignificativo(v: unknown, proibidos: readonly (string | null | undefined)[] = []): v is string {
  if (typeof v !== "string") return false;
  const n = normalizarTexto(v);
  if (n.replace(/ /g, "").length < 2) return false;
  if (GENERICOS.has(n)) return false;
  return !proibidos.some((p) => typeof p === "string" && p.trim() && normalizarTexto(p) === n);
}

export type EstadoContato =
  /** Houve resposta real da paciente, com conteúdo. */
  | "respondeu"
  /** Marcado como "respondeu", mas a resposta não foi descrita (vazia, pontuação ou genérica). */
  | "resposta_incompleta"
  /** Tentativa feita, sem resposta (aguardando ou não respondeu). */
  | "sem_resposta"
  /** Tentativa planejada que não aconteceu. */
  | "nao_realizado"
  /** Mensagem que não espera retorno (ex.: aniversário). Não é tentativa de contato. */
  | "mensagem"
  /** Registro sem contato com paciente (informativo, conferência). */
  | "sem_contato";

export type Desfecho =
  | "agendou" | "resolvido" | "encerrado" | "adiou" | "sem_interesse" | "interessada"
  | "encaminhado_profissional" | "profissional_orientou" | "encaminhado_comercial" | "gestao"
  | "promessa_pagamento" | "pagamento_confirmado" | "negociacao" | "compareceu" | "faltou" | "encaminhado";

export interface RegistroLido {
  estado: EstadoContato;
  /** Situação do caso gravada no registro (aguardando, pendente, agendado…). */
  situacao: string | null;
  /** Contato feito sem marcar se houve resposta (registros antigos da fila). */
  respostaNaoMarcada: boolean;
  /** Conta como tentativa efetiva de contato (contato = sim, exceto mensagem sem retorno esperado). */
  tentativa: boolean;
  /** A resposta veio hoje de um contato anterior (sem nova tentativa hoje). */
  respostaPosterior: boolean;
  /** Rótulo da atividade/ação ("Continuidade de tratamento"). */
  acao: string | null;
  /** Descrição do que foi feito, quando diz algo além do rótulo. */
  feito: string | null;
  orientacao: string | null;
  resposta: string | null;
  /** A resposta é o relato da paciente (pós-procedimento). */
  relato: boolean;
  motivo: string | null;
  desfecho: Desfecho | null;
  agendadoPara: string | null;
  profissional: string | null;
  pergunta: string | null;
  conclusao: string | null;
  /** Observação livre (contexto), separada da resposta. */
  observacao: string | null;
  proximo: { acao: string; prazo: string | null; responsavel: string | null } | null;
  /** O que falta para o registro ser compreensível (vazio = completo). */
  incompleto: string[];
  atencao: boolean;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
/** Sem pontuação solta no fim (o texto final põe a própria). */
const limparFim = (v: string) => v.replace(/[\s.;,:—–-]+$/u, "").trim();

const PENDENTES = ["aguardando", "pendente", "aguardando_gestao", "encaminhado"];

export function lerRegistro(e: EventoRow): RegistroLido {
  const p = (e.payload ?? {}) as Record<string, unknown>;
  const d = (p.detalhes ?? {}) as Record<string, unknown>;
  const rr = str(d.resultado_rotina);
  const acao = str(d.acao) ?? str(p.contexto);
  // Ações da fila no formato anterior (sem situação): tudo em `notes` — "texto — próxima ação: X".
  const legado = !e.situacao;
  const notasLegado = legado ? str(e.notes) : null;
  const proximaLegado = notasLegado ? /—\s*próxima ação:\s*(.*)$/iu.exec(notasLegado)?.[1] ?? null : null;
  const notasSemProxima = notasLegado ? str(notasLegado.replace(/\s*—\s*próxima ação:.*$/iu, "")) : null;
  const feitoBruto = str(p.feito) ?? (e.kind === "resposta" || e.kind === "encerramento" ? null : notasSemProxima);
  const contato = e.contato ?? (e.kind === "contato" ? "sim" : null);
  const resposta = e.resposta ?? (e.kind === "resposta" ? "sim" : null);
  const incompleto: string[] = [];
  const proibidos = [acao, str(p.contexto)];

  // Orientação: campo próprio (atual) ou, nos registros antigos, o trecho "— orientação: …" do feito.
  const orientacaoAntiga = feitoBruto ? /—\s*orienta[çc][ãa]o:\s*(.*)$/iu.exec(feitoBruto)?.[1] ?? null : null;
  const orientacaoBruta = str(d.orientacao) ?? orientacaoAntiga;
  const orientacao = textoSignificativo(orientacaoBruta, proibidos) ? limparFim(orientacaoBruta) : null;
  if (rr === "orientacao" && !orientacao) incompleto.push("orientação não descrita");

  // Resposta da paciente. Registro antigo de orientação: a "resposta" era o mesmo texto da orientação —
  // não é o que a paciente disse, então fica como não registrada.
  const formatoAntigoOrientacao = rr === "orientacao" && !str(d.orientacao);
  const respostaBruta = formatoAntigoOrientacao ? null : str(e.resultado) ?? (legado && e.kind === "resposta" ? notasSemProxima : null);
  const respostaOk = textoSignificativo(respostaBruta, proibidos) ? limparFim(respostaBruta) : null;
  const relato = d.relato_paciente === "sim";

  let estado: EstadoContato;
  if (resposta === "sim") estado = respostaOk ? "respondeu" : "resposta_incompleta";
  else if (contato === "nao") estado = "nao_realizado";
  else if (contato === "sim" && resposta === "na") estado = "mensagem";
  else if (contato === "sim") estado = "sem_resposta";
  else estado = "sem_contato";
  if (estado === "resposta_incompleta") incompleto.push(relato ? "relato da paciente não descrito" : "resposta da paciente não descrita");

  // Feito: só quando diz algo além do rótulo da atividade (sem os trechos que viram campos próprios).
  const feitoLimpo = feitoBruto ? feitoBruto.replace(/—\s*orienta[çc][ãa]o:.*$/iu, "").replace(/—\s*(não realizado|sem resposta)(:.*)?$/iu, "").replace(/—\s*encaminhad[oa] a .*$/iu, "").trim() : null;
  const feito = textoSignificativo(feitoLimpo, proibidos) ? limparFim(feitoLimpo) : null;

  const motivoBruto = str(d.motivo_nao_realizado) ?? (feitoBruto ? /—\s*não realizado:\s*(.*)$/iu.exec(feitoBruto)?.[1] ?? null : null) ?? (e.situacao === "dispensado" ? str(d.motivo) ?? str(e.notes) : null);
  const motivo = textoSignificativo(motivoBruto) ? limparFim(motivoBruto) : null;
  if (estado === "nao_realizado" && !motivo) incompleto.push("motivo de não ter feito o contato não informado");

  let desfecho: Desfecho | null = null;
  switch (rr) {
    case "adiou": case "sem_interesse": case "interessada": case "encaminhado_comercial": case "promessa_pagamento": case "pagamento_confirmado": case "negociacao":
      desfecho = rr; break;
    case "encaminhado_profissional": desfecho = d.estado_acompanhamento === "profissional_orientou" ? "profissional_orientou" : "encaminhado_profissional"; break;
    case "encaminhado_gestao": desfecho = "gestao"; break;
  }
  if (!desfecho) {
    if (d.atencao_profissional === "sim") desfecho = d.estado_acompanhamento === "profissional_orientou" ? "profissional_orientou" : "encaminhado_profissional";
    else switch (e.situacao ?? (e.kind === "agendamento_obtido" ? "agendado" : e.kind === "atendimento_realizado" ? "compareceu" : e.kind === "cancelamento" ? "faltou" : e.kind === "encerramento" ? "resolvido" : null)) {
      case "agendado": desfecho = "agendou"; break;
      case "resolvido": desfecho = "resolvido"; break;
      case "dispensado": desfecho = "encerrado"; break;
      case "aguardando_gestao": desfecho = "gestao"; break;
      case "encaminhado": desfecho = "encaminhado"; break;
      case "compareceu": desfecho = "compareceu"; break;
      case "faltou": desfecho = "faltou"; break;
    }
  }
  const agendadoPara = str(e.scheduledFor);
  if (desfecho === "agendou" && !agendadoPara) incompleto.push("data do agendamento não informada");

  const conclusaoBruta = str(d.conclusao) ?? (legado && e.kind === "encerramento" ? notasSemProxima : null);
  const conclusao = textoSignificativo(conclusaoBruta, proibidos) ? limparFim(conclusaoBruta) : null;
  if (desfecho === "resolvido" && !conclusao && !respostaOk && !feito) incompleto.push("resultado da resolução não descrito");
  if (desfecho === "encerrado" && !motivo) incompleto.push("motivo do encerramento não informado");

  const obsBruta = str(d.observacao);
  const observacao = textoSignificativo(obsBruta, proibidos) ? limparFim(obsBruta) : null;
  const proxAcao = str(p.proxima) ?? proximaLegado;
  const proximo = proxAcao && (PENDENTES.includes(e.situacao ?? "") || !e.situacao)
    ? { acao: limparFim(proxAcao), prazo: str(p.prazo), responsavel: str(p.responsavel) }
    : null;
  if (PENDENTES.includes(e.situacao ?? "") && !proximo) incompleto.push("próximo passo não definido");

  return {
    estado, situacao: e.situacao ?? null, respostaNaoMarcada: contato === "sim" && resposta == null, tentativa: contato === "sim" && estado !== "mensagem", respostaPosterior: resposta === "sim" && contato !== "sim",
    acao, feito, orientacao, resposta: respostaOk, relato, motivo, desfecho, agendadoPara,
    profissional: str(d.profissional) ?? str(d.para), pergunta: str(p.pergunta), conclusao, observacao, proximo, incompleto, atencao: p.atencao === true,
  };
}

const dataCurta = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");

/**
 * Frase humana do registro para o WhatsApp ("Orientação dada: próxima etapa. Respondeu: prefere
 * dezembro. Preferiu adiar. Próximo passo: retomar o contato até 25/11 (Gabi)."). Sem gênero
 * presumido pelo nome. Nada de "contato:", "resposta: .",
 * códigos internos ou campos vazios; o que falta aparece como registro incompleto.
 */
export function fraseDoRegistro(r: RegistroLido, opts: { responsavelPadrao?: string | null } = {}): string {
  const partes: string[] = [];
  switch (r.estado) {
    case "nao_realizado": partes.push(r.motivo ? `Contato não realizado: ${r.motivo}` : "Contato não realizado"); break;
    case "sem_resposta":
      // O que foi feito (quando descrito) + o estado: "Ligação, aguardando resposta".
      if (r.feito && /sem resposta|aguardando resposta/i.test(r.feito)) partes.push(r.feito);
      else partes.push(`${r.feito ?? (r.situacao === "aguardando" ? "Mensagem enviada" : "Contato feito")}, ${r.respostaNaoMarcada ? "sem resposta registrada" : r.situacao === "aguardando" ? "aguardando resposta" : "sem resposta"}`);
      break;
    case "mensagem": partes.push(r.feito ?? "Mensagem enviada"); break;
    case "sem_contato": if (r.feito) partes.push(r.feito); break;
    case "respondeu": case "resposta_incompleta":
      if (r.feito) partes.push(r.feito);
      break;
  }
  if (r.orientacao) partes.push(`Orientação dada: ${r.orientacao}`);
  if (r.resposta) partes.push(r.respostaPosterior ? `Retornou: ${r.resposta}` : r.relato ? `Relatou: ${r.resposta}` : `Respondeu: ${r.resposta}`);

  switch (r.desfecho) {
    case "agendou": partes.push(r.agendadoPara ? `Agendou para ${dataCurta(r.agendadoPara)}` : "Agendou (data não informada)"); break;
    case "resolvido": partes.push(r.conclusao ? `Resolvido: ${r.conclusao}` : "Resolvido"); break;
    case "encerrado": partes.push(r.motivo ? `Encerrado sem resolver: ${r.motivo}` : "Encerrado sem resolver"); break;
    case "adiou": partes.push("Preferiu adiar"); break;
    case "sem_interesse": partes.push("Sem interesse no momento"); break;
    case "interessada": partes.push("Tem interesse, aguardando definição"); break;
    case "encaminhado_profissional": partes.push(`Caso encaminhado a ${r.profissional ?? "profissional"}; retorno ainda pendente`); break;
    case "profissional_orientou": partes.push(`${r.profissional ?? "Profissional"} já orientou`); break;
    case "encaminhado_comercial": partes.push("Caso encaminhado à comercial externa"); break;
    case "gestao": partes.push(r.pergunta ? `Aguarda decisão da gestão: ${limparFim(r.pergunta)}` : "Aguarda decisão da gestão"); break;
    case "encaminhado": partes.push(r.profissional ? `Caso encaminhado a ${r.profissional}` : "Caso encaminhado"); break;
    case "compareceu": partes.push("Compareceu à consulta (conferir no Simples Dental)"); break;
    case "faltou": partes.push("Faltou à consulta"); break;
    // Cobrança: o resultado já descreve (promessa ≠ pagamento).
  }
  if (r.observacao) partes.push(`Obs.: ${r.observacao}`);
  if (r.proximo) {
    const resp = r.proximo.responsavel && r.proximo.responsavel !== opts.responsavelPadrao ? ` (${r.proximo.responsavel})` : "";
    partes.push(`Próximo passo: ${r.proximo.acao.charAt(0).toLowerCase()}${r.proximo.acao.slice(1)}${r.proximo.prazo ? ` até ${dataCurta(r.proximo.prazo)}` : ""}${resp}`);
  }
  if (r.incompleto.length) partes.push(`⚠️ Registro incompleto: ${r.incompleto.join("; ")}`);
  const texto = partes.map(limparFim).filter(Boolean).map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join(". ");
  return texto ? `${texto}.` : "Registro sem descrição.";
}

/**
 * Indicadores do dia a partir dos registros — fórmulas (todas por EVENTO, salvo "pacientes"):
 *   tentativas            = registros com contato realizado (contato = sim), exceto mensagens sem retorno esperado
 *   pacientesContatadas   = pacientes distintas entre as tentativas
 *   respostas             = registros com resposta real descrita (inclui resposta hoje a contato anterior)
 *   pacientesResponderam  = pacientes distintas entre as respostas
 *   respostasIncompletas  = marcados como "respondeu" sem a resposta descrita (não contam como resposta)
 *   semResposta           = tentativas sem resposta (aguardando ou não respondeu)
 *   naoRealizados         = contatos planejados que não aconteceram (não são tentativa)
 *   mensagens             = mensagens sem retorno esperado (aniversário) — fora das tentativas
 *   agendamentos          = registros com agendamento (desfecho agendou), um por registro
 *   resolvidos            = registros que encerraram o caso como resolvido (resposta ≠ resolução)
 *   encerradosSemResolver = encerrados com motivo, inclusive "sem interesse no momento" (não é resolução)
 * Invariante: tentativas = (tentativas com resposta) + (tentativas com resposta incompleta) + semResposta.
 * Um registro ligado a vários itens conta uma vez.
 */
export interface ContagemRegistros {
  registros: number;
  tentativas: number;
  pacientesContatadas: number;
  respostas: number;
  pacientesResponderam: number;
  respostasIncompletas: number;
  semResposta: number;
  naoRealizados: number;
  mensagens: number;
  semContato: number;
  agendamentos: number;
  resolvidos: number;
  encerradosSemResolver: number;
  encaminhadosProfissional: number;
  registrosIncompletos: number;
  /** Tentativas por estado (para conferir a invariante). */
  tentativasPorEstado: { respondeu: number; resposta_incompleta: number; sem_resposta: number };
}

const chavePaciente = (e: EventoRow) => e.patientId ?? `assunto:${e.assunto ?? e.id}`;

export function contarRegistros(eventos: EventoRow[]): ContagemRegistros {
  const lidos = eventos.map((e) => ({ e, r: lerRegistro(e) }));
  const tent = lidos.filter((x) => x.r.tentativa);
  const resp = lidos.filter((x) => x.r.estado === "respondeu");
  return {
    registros: eventos.length,
    tentativas: tent.length,
    pacientesContatadas: new Set(tent.map((x) => chavePaciente(x.e))).size,
    respostas: resp.length,
    pacientesResponderam: new Set(resp.map((x) => chavePaciente(x.e))).size,
    respostasIncompletas: lidos.filter((x) => x.r.estado === "resposta_incompleta").length,
    semResposta: lidos.filter((x) => x.r.estado === "sem_resposta").length,
    naoRealizados: lidos.filter((x) => x.r.estado === "nao_realizado").length,
    mensagens: lidos.filter((x) => x.r.estado === "mensagem").length,
    semContato: lidos.filter((x) => x.r.estado === "sem_contato").length,
    agendamentos: lidos.filter((x) => x.r.desfecho === "agendou").length,
    resolvidos: lidos.filter((x) => x.r.desfecho === "resolvido").length,
    encerradosSemResolver: lidos.filter((x) => x.r.desfecho === "encerrado" || x.r.desfecho === "sem_interesse").length,
    encaminhadosProfissional: lidos.filter((x) => x.r.desfecho === "encaminhado_profissional" || x.r.desfecho === "profissional_orientou").length,
    registrosIncompletos: lidos.filter((x) => x.r.incompleto.length > 0).length,
    tentativasPorEstado: {
      respondeu: tent.filter((x) => x.r.estado === "respondeu").length,
      resposta_incompleta: tent.filter((x) => x.r.estado === "resposta_incompleta").length,
      sem_resposta: tent.filter((x) => x.r.estado === "sem_resposta").length,
    },
  };
}

/** A conta fecha? (toda tentativa tem um estado válido). Falso = erro de classificação, nunca ajustar o total. */
export function contagemConsistente(c: ContagemRegistros): boolean {
  const t = c.tentativasPorEstado;
  return c.tentativas === t.respondeu + t.resposta_incompleta + t.sem_resposta;
}

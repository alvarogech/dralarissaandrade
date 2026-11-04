import type { ItemRotina, ResultadoContato } from "./rotina-itens";
import type { EntradaRegistro } from "./registro";
import { textoSignificativo } from "./leitura-registro";

/**
 * Contato com paciente feito a partir de uma atividade da rotina (tipo B). Puro: traduz o que a
 * concierge escolheu para os campos do registro do dia que já existem (contato, resposta, situação,
 * próxima ação) — nenhuma enumeração nova vai ao banco. A ligação com a atividade fica em
 * `detalhes.rotina_item` (e o marco em `detalhes.marco`); o valor escolhido, em
 * `detalhes.resultado_rotina` (valores antigos continuam válidos e com rótulo).
 *
 * Duas camadas, para não misturar tentativa com desfecho:
 *   A. situação do contato — não realizado · realizado, aguardando resposta · realizado, sem resposta ·
 *      paciente respondeu;
 *   B. desfecho, só quando a paciente respondeu — orientação, agendamento, comercial, profissional,
 *      resolvido, nova ação, (continuidade) interessada / adiou / sem interesse (e os de cobrança).
 * Cada coisa tem seu campo (03/11): o que a PACIENTE respondeu (ou relatou), a ORIENTAÇÃO dada, a
 * CONCLUSÃO de um caso resolvido e o MOTIVO de não ter feito o contato — antes um único campo
 * "observação" virava orientação e resposta ao mesmo tempo ("orientação: .; resposta: .").
 * Textos vazios, só pontuação ou genéricos ("Contato realizado", "Acompanhamento") não valem.
 * Sem resposta sempre deixa uma próxima tentativa com data (regra global, followup.ts — o servidor
 * garante). "Feito" na atividade = ação executada, não caso resolvido.
 */
export const ROTULO_RESULTADO: Record<ResultadoContato, string> = {
  nao_realizado: "Não realizado",
  aguardando_resposta: "Realizado, aguardando resposta",
  nao_respondeu: "Realizado, sem resposta",
  respondeu: "Paciente respondeu",
  orientacao: "Orientação prestada",
  contato_realizado: "Contato realizado",
  mensagem_enviada: "Mensagem enviada",
  agendou: "Agendamento realizado",
  encaminhado_comercial: "Encaminhado à comercial",
  encaminhado_profissional: "Encaminhado ao profissional",
  resolvido: "Resolvido",
  nova_acao: "Necessita nova ação",
  pagamento_confirmado: "Pagamento confirmado",
  promessa_pagamento: "Promessa de pagamento",
  negociacao: "Negociação solicitada",
  encaminhado_gestao: "Encaminhado à gestão",
  interessada: "Interessada, aguardando definição",
  adiou: "Preferiu adiar",
  sem_interesse: "Sem interesse no momento",
};

/** Rótulo do resultado nesta atividade (com o rótulo próprio dela, quando houver). */
export const rotuloResultado = (r: ResultadoContato, item?: ItemRotina) => item?.pacientes?.rotulos?.[r] ?? ROTULO_RESULTADO[r];

/**
 * Desfechos em que o próprio resultado é objetivo (data, pagamento, pergunta à gestão) — nos demais,
 * quando a paciente respondeu, o que ela disse é obrigatório.
 */
const RESULTADO_OBJETIVO: readonly ResultadoContato[] = ["agendou", "pagamento_confirmado", "promessa_pagamento", "negociacao"];

/** Camada A — situação do contato. */
export const SITUACOES_CONTATO = ["respondeu", "aguardando_resposta", "nao_respondeu", "nao_realizado"] as const;
export type SituacaoContato = (typeof SITUACOES_CONTATO)[number];
export const SEM_RESPOSTA: readonly ResultadoContato[] = ["aguardando_resposta", "nao_respondeu", "nao_realizado"];

/** O que a escolha pede além da paciente (para mostrar só os campos necessários). */
export interface CamposResultado {
  continuidade: boolean;
  agendamento: boolean;
  pergunta: boolean;
  /** Pede "qual orientação foi dada". */
  orientacao: boolean;
  /** Pede o profissional (encaminhamento direto, fora do bloco de atenção do pós-procedimento). */
  profissional: boolean;
  /** Pede um texto obrigatório: motivo (não realizado) ou conclusão (resolvido). */
  observacaoObrigatoria: boolean;
  rotuloData: string;
  proximaPadrao: string;
}

export function camposDoResultado(r: ResultadoContato): CamposResultado {
  const base: CamposResultado = { continuidade: false, agendamento: false, pergunta: false, orientacao: false, profissional: false, observacaoObrigatoria: false, rotuloData: "Quando", proximaPadrao: "" };
  switch (r) {
    case "aguardando_resposta": return { ...base, continuidade: true, rotuloData: "Verificar em", proximaPadrao: "Verificar se respondeu" };
    case "nao_respondeu": return { ...base, continuidade: true, rotuloData: "Tentar de novo em", proximaPadrao: "Tentar contato de novo" };
    case "nao_realizado": return { ...base, continuidade: true, observacaoObrigatoria: true, rotuloData: "Fazer em", proximaPadrao: "Fazer o contato" };
    case "nova_acao": return { ...base, continuidade: true, proximaPadrao: "" };
    case "promessa_pagamento": return { ...base, continuidade: true, rotuloData: "Data prometida", proximaPadrao: "Confirmar o pagamento no Simples Dental" };
    case "encaminhado_comercial": return { ...base, continuidade: true, rotuloData: "Retorno da comercial até", proximaPadrao: "Contato da comercial externa" };
    case "encaminhado_profissional": return { ...base, continuidade: true, profissional: true, rotuloData: "Acompanhar até", proximaPadrao: "Acompanhar o retorno do profissional" };
    case "interessada": return { ...base, continuidade: true, rotuloData: "Retomar em", proximaPadrao: "Retomar o contato para definir" };
    case "adiou": return { ...base, continuidade: true, rotuloData: "Retomar em", proximaPadrao: "Retomar o contato" };
    case "agendou": return { ...base, agendamento: true };
    case "negociacao": case "encaminhado_gestao": return { ...base, pergunta: true, rotuloData: "Preciso da resposta até" };
    case "resolvido": return { ...base, observacaoObrigatoria: true };
    case "orientacao": return { ...base, orientacao: true };
    default: return base;
  }
}

export interface EntradaContato {
  eventoId: string;
  item: ItemRotina;
  /** Camada A (ou, nas atividades sem tentativa — aniversário —, o resultado direto). */
  resultado: ResultadoContato;
  /** Camada B, quando a paciente respondeu. */
  desfecho?: ResultadoContato | null;
  pacienteId?: string | null;
  /** Nome digitado quando a paciente não está no cadastro (nunca se inventa identificador). */
  nomeNovo?: string;
  observacao?: string;
  /** O que a paciente respondeu (obrigatório quando respondeu, salvo resultado objetivo). */
  resposta?: string;
  /** Qual orientação foi dada (desfecho "orientação"). */
  orientacao?: string;
  /** Profissional a quem foi encaminhada (encaminhamento direto). */
  profissional?: string;
  /** Pós-procedimento: como a paciente relatou estar (obrigatório quando respondeu). */
  relato?: string;
  proximaAcao?: string;
  prazo?: string;
  agendadoPara?: string;
  pergunta?: string;
  /** Pós-procedimento: necessita atenção do profissional. */
  atencao?: { profissional: string; motivo: string; em: string; estado: "aguardando_profissional" | "profissional_orientou" } | null;
  /** Responsável pela próxima ação ("perfil:<uuid>" | comercial_externa | gestao | dra_larissa). */
  responsavel: string;
  canal?: string;
  /** Repetir um marco já registrado para a mesma paciente: motivo obrigatório. */
  justificativaRepeticao?: string;
}

const dataBr = (iso: string) => iso.split("-").reverse().join("/");
const t = (v?: string) => (v ?? "").trim();

/** O que efetivamente define os campos: o desfecho quando a paciente respondeu, senão a situação. */
export function escolhaEfetiva(e: Pick<EntradaContato, "resultado" | "desfecho" | "atencao">): ResultadoContato {
  if (e.resultado === "respondeu") {
    if (e.atencao && e.atencao.estado === "aguardando_profissional") return "encaminhado_profissional";
    return e.desfecho ?? "respondeu";
  }
  return e.resultado;
}

/** A paciente respondeu e o desfecho escolhido não é objetivo: o que ela disse é obrigatório. */
export function pedeResposta(e: Pick<EntradaContato, "resultado" | "desfecho" | "atencao">, item?: ItemRotina): boolean {
  return e.resultado === "respondeu" && !item?.pacientes?.relato && !RESULTADO_OBJETIVO.includes(escolhaEfetiva(e));
}

/** Validação junto do campo (o servidor revalida tudo). Retorna [campo, mensagem]. */
export function validarContato(e: Omit<EntradaContato, "eventoId" | "item"> & { item?: ItemRotina }, hoje: string): [string, string][] {
  const erros: [string, string][] = [];
  const vale = (v?: string) => textoSignificativo(v, [e.item?.pacientes?.acao, e.item?.curto]);
  if (!e.pacienteId && !t(e.nomeNovo)) erros.push(["paciente", "Informe a paciente: escolha no cadastro ou digite o nome."]);
  const efetiva = escolhaEfetiva(e);
  const respondeu = e.resultado === "respondeu";
  const pedeRelato = !!e.item?.pacientes?.relato && respondeu;
  if (pedeRelato && !vale(e.relato)) {
    erros.push(["relato", t(e.relato) ? "Descreva como a paciente está (ex.: “sem dor, cicatrizando bem”) — “acompanhamento” não diz como ela está." : "Conte como a paciente relatou estar (só o que ela disse; não é preciso avaliar)."]);
  }
  if (pedeResposta(e, e.item) && !vale(e.resposta)) {
    erros.push(["resposta", t(e.resposta) ? "Escreva o que a paciente disse (ex.: “prefere fazer em dezembro”) — “contato realizado” é o que você fez, não a resposta dela." : "Escreva o que a paciente respondeu, em poucas palavras."]);
  }
  if (e.atencao) {
    if (!t(e.atencao.profissional)) erros.push(["profissional", "Informe o profissional responsável."]);
    if (!t(e.atencao.motivo)) erros.push(["motivo", "Informe o motivo do encaminhamento."]);
  }
  const c = camposDoResultado(efetiva);
  if (c.orientacao && !vale(e.orientacao)) erros.push(["orientacao", "Diga qual orientação foi dada (ex.: “expliquei a próxima etapa e o valor”)."]);
  if (c.profissional && !e.atencao && !t(e.profissional)) erros.push(["profissional", "Informe a profissional a quem foi encaminhada."]);
  if (c.continuidade) {
    if (!t(e.proximaAcao)) erros.push(["proxima", "Escreva o próximo passo."]);
    if (!e.prazo || e.prazo < hoje) erros.push(["prazo", "Escolha a data (hoje ou depois)."]);
  }
  if (c.agendamento && !e.agendadoPara) erros.push(["agendadoPara", "Informe a data da consulta agendada."]);
  if (c.pergunta) {
    if (!t(e.pergunta)) erros.push(["pergunta", "Escreva o que a gestão precisa decidir."]);
    if (!e.prazo || e.prazo < hoje) erros.push(["prazo", "Escolha até quando precisa da resposta."]);
  }
  if (c.observacaoObrigatoria && !vale(e.observacao)) {
    erros.push(["observacao", efetiva === "nao_realizado" ? "Diga por que o contato não foi feito." : "Conte em poucas palavras o que ficou resolvido."]);
  }
  return erros;
}

/** Monta a entrada do registro do dia (mesmo endpoint e regras de qualquer registro). */
export function registroDoContato(e: EntradaContato): Omit<EntradaRegistro, "data"> {
  const p = e.item.pacientes!;
  const obs = t(e.observacao);
  const relato = t(e.relato);
  const efetiva = escolhaEfetiva(e);
  const detalhes: Record<string, string> = { rotina_item: e.item.key, resultado_rotina: efetiva, situacao_contato: e.resultado, acao: p.acao };
  if (p.marco) detalhes.marco = p.marco;
  if (relato) detalhes.relato_paciente = "sim";
  if (t(e.justificativaRepeticao)) detalhes.justificativa_repeticao = t(e.justificativaRepeticao);
  if (e.atencao) Object.assign(detalhes, { atencao_profissional: "sim", profissional: t(e.atencao.profissional), motivo_encaminhamento: t(e.atencao.motivo), encaminhado_em: e.atencao.em, estado_acompanhamento: e.atencao.estado });
  else if (efetiva === "encaminhado_profissional" && t(e.profissional)) detalhes.profissional = t(e.profissional);
  // Cada texto no seu campo: orientação, conclusão, motivo e observação livre nunca viram "resposta".
  // Orientação: obrigatória no desfecho "orientação"; nos demais (ex.: continuidade que adiou), opcional.
  if (t(e.orientacao)) detalhes.orientacao = t(e.orientacao);
  if (efetiva === "resolvido" && obs) detalhes.conclusao = obs;
  else if (efetiva === "nao_realizado" && obs) detalhes.motivo_nao_realizado = obs;
  else if (obs) detalhes.observacao = obs;
  const comum = {
    eventoId: e.eventoId, alvos: [] as EntradaRegistro["alvos"], categoria: p.categoria,
    pacienteId: e.pacienteId || null, novoPaciente: !e.pacienteId && t(e.nomeNovo) ? { nome: t(e.nomeNovo) } : undefined,
    contexto: e.item.curto ?? p.acao, canal: e.canal, ...(e.atencao ? { atencao: true } : {}),
  };
  const continuidade = { proximaAcao: t(e.proximaAcao), prazo: e.prazo, responsavel: e.responsavel };
  // Resposta da paciente: o relato (pós-procedimento) ou o que ela disse — nunca texto inventado.
  const resposta = relato || t(e.resposta);
  const profissional = t(e.atencao?.profissional) || t(e.profissional);
  switch (efetiva) {
    case "mensagem_enviada":
      return { ...comum, contato: "sim", resposta: "na", situacao: "informativo", feito: p.acao, detalhes };
    case "nao_realizado":
      return { ...comum, contato: "nao", resposta: "na", situacao: "pendente", feito: `${p.acao} — não realizado: ${obs}`, ...continuidade, detalhes };
    case "aguardando_resposta":
      return { ...comum, contato: "sim", resposta: "nao", situacao: "aguardando", feito: p.acao, ...continuidade, detalhes };
    case "nao_respondeu":
      return { ...comum, contato: "sim", resposta: "nao", situacao: "pendente", feito: p.acao, ...continuidade, detalhes };
    case "contato_realizado":
      // Aniversário (e valor antigo): contato feito que não pede resposta — registro simples, sem descrição.
      return { ...comum, contato: "sim", resposta: "na", situacao: "informativo", feito: p.acao, detalhes };
    case "respondeu": case "orientacao":
      return { ...comum, contato: "sim", resposta: "sim", resultado: resposta, situacao: "informativo", feito: p.acao, detalhes };
    case "nova_acao": case "interessada":
      return { ...comum, contato: "sim", resposta: "sim", resultado: resposta, situacao: efetiva === "interessada" ? "aguardando" : "pendente", feito: p.acao, ...continuidade, detalhes };
    case "adiou":
      return { ...comum, contato: "sim", resposta: "sim", resultado: resposta, situacao: "pendente", feito: p.acao, ...continuidade, detalhes };
    case "sem_interesse":
      // Recusa: encerra sem conversão, com o motivo nas palavras da paciente (a paciente continua existindo).
      return { ...comum, contato: "sim", resposta: "sim", resultado: resposta, situacao: "dispensado", motivo: resposta, feito: p.acao, detalhes };
    case "agendou":
      return { ...comum, contato: "sim", resposta: "sim", resultado: resposta || `Agendou para ${dataBr(e.agendadoPara ?? "")}`, situacao: "agendado", agendadoPara: e.agendadoPara, feito: p.acao, detalhes };
    case "resolvido":
      return { ...comum, contato: "sim", resposta: "sim", resultado: resposta, situacao: "resolvido", feito: p.acao, detalhes };
    case "encaminhado_comercial":
      return {
        ...comum, categoria: "encaminhamento", contato: "sim", resposta: "sim", resultado: resposta, situacao: "encaminhado", feito: p.acao,
        ...continuidade, responsavel: "comercial_externa", detalhes: { ...detalhes, para: "Comercial Externa", ...(obs ? { motivo_encaminhamento: obs } : {}) },
      };
    case "encaminhado_profissional":
      // A concierge registra o relato e encaminha; não avalia. O caso segue até o profissional orientar.
      return {
        ...comum, contato: "sim", resposta: "sim", resultado: resposta, situacao: "encaminhado", feito: `${p.acao} — encaminhado a ${profissional || "profissional"}`,
        ...continuidade, responsavel: /larissa/i.test(profissional) ? "dra_larissa" : e.responsavel, detalhes: { ...detalhes, para: profissional || "Profissional" },
      };
    case "pagamento_confirmado":
      return { ...comum, contato: "sim", resposta: "sim", resultado: resposta ? `Pagamento confirmado — ${resposta}` : "Pagamento confirmado no Simples Dental", situacao: "resolvido", feito: p.acao, detalhes: { ...detalhes, pagamento_confirmado: "sim" } };
    case "promessa_pagamento":
      return { ...comum, contato: "sim", resposta: "sim", resultado: resposta ? `Promessa de pagamento — ${resposta}` : "Promessa de pagamento (não é recebimento)", situacao: "aguardando", feito: p.acao, ...continuidade, detalhes };
    case "negociacao":
      return { ...comum, contato: "sim", resposta: "sim", resultado: resposta ? `Pediu negociação — ${resposta}` : "Pediu negociação", situacao: "aguardando_gestao", pergunta: t(e.pergunta), prazo: e.prazo, feito: p.acao, detalhes };
    case "encaminhado_gestao":
      return { ...comum, contato: "sim", resposta: "sim", resultado: resposta, situacao: "aguardando_gestao", pergunta: t(e.pergunta), prazo: e.prazo, feito: p.acao, detalhes };
  }
}

/** Resultado registrado (para contar no fechamento): lê `detalhes.resultado_rotina` do evento. */
export function resultadoDoEvento(payload: Record<string, unknown> | undefined): ResultadoContato | null {
  const d = (payload?.detalhes ?? {}) as Record<string, unknown>;
  const r = d.resultado_rotina;
  return typeof r === "string" && r in ROTULO_RESULTADO ? (r as ResultadoContato) : null;
}

export function itemDoEvento(payload: Record<string, unknown> | undefined): string | null {
  const d = (payload?.detalhes ?? {}) as Record<string, unknown>;
  return typeof d.rotina_item === "string" ? d.rotina_item : null;
}

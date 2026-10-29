import type { ItemRotina, ResultadoContato } from "./rotina-itens";
import type { EntradaRegistro } from "./registro";

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
 *      resolvido, nova ação (e os de cobrança).
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
};

/** Camada A — situação do contato. */
export const SITUACOES_CONTATO = ["respondeu", "aguardando_resposta", "nao_respondeu", "nao_realizado"] as const;
export type SituacaoContato = (typeof SITUACOES_CONTATO)[number];
export const SEM_RESPOSTA: readonly ResultadoContato[] = ["aguardando_resposta", "nao_respondeu", "nao_realizado"];

/** O que a escolha pede além da paciente (para mostrar só os campos necessários). */
export interface CamposResultado {
  continuidade: boolean;
  agendamento: boolean;
  pergunta: boolean;
  observacaoObrigatoria: boolean;
  rotuloData: string;
  proximaPadrao: string;
}

export function camposDoResultado(r: ResultadoContato): CamposResultado {
  const base: CamposResultado = { continuidade: false, agendamento: false, pergunta: false, observacaoObrigatoria: false, rotuloData: "Quando", proximaPadrao: "" };
  switch (r) {
    case "aguardando_resposta": return { ...base, continuidade: true, rotuloData: "Verificar em", proximaPadrao: "Verificar se respondeu" };
    case "nao_respondeu": return { ...base, continuidade: true, rotuloData: "Tentar de novo em", proximaPadrao: "Tentar contato de novo" };
    case "nao_realizado": return { ...base, continuidade: true, observacaoObrigatoria: true, rotuloData: "Fazer em", proximaPadrao: "Fazer o contato" };
    case "nova_acao": return { ...base, continuidade: true, proximaPadrao: "" };
    case "promessa_pagamento": return { ...base, continuidade: true, rotuloData: "Data prometida", proximaPadrao: "Confirmar o pagamento no Simples Dental" };
    case "encaminhado_comercial": return { ...base, continuidade: true, rotuloData: "Retorno da comercial até", proximaPadrao: "Contato da comercial externa" };
    case "encaminhado_profissional": return { ...base, continuidade: true, rotuloData: "Acompanhar até", proximaPadrao: "Acompanhar o retorno do profissional" };
    case "agendou": return { ...base, agendamento: true };
    case "negociacao": case "encaminhado_gestao": return { ...base, pergunta: true, rotuloData: "Preciso da resposta até" };
    case "resolvido": case "orientacao": return { ...base, observacaoObrigatoria: true };
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

/** Validação junto do campo (o servidor revalida tudo). Retorna [campo, mensagem]. */
export function validarContato(e: Omit<EntradaContato, "eventoId" | "item"> & { item?: ItemRotina }, hoje: string): [string, string][] {
  const erros: [string, string][] = [];
  if (!e.pacienteId && !t(e.nomeNovo)) erros.push(["paciente", "Informe a paciente: escolha no cadastro ou digite o nome."]);
  const pedeRelato = !!e.item?.pacientes?.relato && e.resultado === "respondeu";
  if (pedeRelato && !t(e.relato)) erros.push(["relato", "Conte como a paciente relatou estar (só o que ela disse; não é preciso avaliar)."]);
  if (e.atencao) {
    if (!t(e.atencao.profissional)) erros.push(["profissional", "Informe o profissional responsável."]);
    if (!t(e.atencao.motivo)) erros.push(["motivo", "Informe o motivo do encaminhamento."]);
  }
  const efetiva = escolhaEfetiva(e);
  const c = camposDoResultado(efetiva);
  if (c.continuidade) {
    if (!t(e.proximaAcao)) erros.push(["proxima", "Escreva o próximo passo."]);
    if (!e.prazo || e.prazo < hoje) erros.push(["prazo", "Escolha a data (hoje ou depois)."]);
  }
  if (c.agendamento && !e.agendadoPara) erros.push(["agendadoPara", "Informe a data da consulta agendada."]);
  if (c.pergunta) {
    if (!t(e.pergunta)) erros.push(["pergunta", "Escreva o que a gestão precisa decidir."]);
    if (!e.prazo || e.prazo < hoje) erros.push(["prazo", "Escolha até quando precisa da resposta."]);
  }
  if (c.observacaoObrigatoria && !t(e.observacao) && !(pedeRelato && t(e.relato))) {
    erros.push(["observacao", efetiva === "nao_realizado" ? "Diga por que o contato não foi feito." : efetiva === "orientacao" ? "Diga qual orientação foi dada." : "Conte em poucas palavras o que ficou resolvido."]);
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
  const comum = {
    eventoId: e.eventoId, alvos: [] as EntradaRegistro["alvos"], categoria: p.categoria,
    pacienteId: e.pacienteId || null, novoPaciente: !e.pacienteId && t(e.nomeNovo) ? { nome: t(e.nomeNovo) } : undefined,
    contexto: e.item.curto ?? p.acao, canal: e.canal, ...(e.atencao ? { atencao: true } : {}),
  };
  const continuidade = { proximaAcao: t(e.proximaAcao), prazo: e.prazo, responsavel: e.responsavel };
  // Resposta da paciente: o relato (pós-procedimento) ou a observação; nunca texto inventado.
  const resposta = relato ? (obs ? `${relato} — ${obs}` : relato) : obs;
  switch (efetiva) {
    case "mensagem_enviada":
      return { ...comum, contato: "sim", resposta: "na", situacao: "informativo", feito: obs ? `${p.acao}: ${obs}` : p.acao, detalhes };
    case "nao_realizado":
      return { ...comum, contato: "nao", resposta: "na", situacao: "pendente", feito: `${p.acao} — não realizado: ${obs}`, ...continuidade, detalhes };
    case "aguardando_resposta":
      return { ...comum, contato: "sim", resposta: "nao", situacao: "aguardando", feito: obs ? `${p.acao}: ${obs}` : p.acao, ...continuidade, detalhes };
    case "nao_respondeu":
      return { ...comum, contato: "sim", resposta: "nao", situacao: "pendente", feito: obs ? `${p.acao} — sem resposta: ${obs}` : `${p.acao} — sem resposta`, ...continuidade, detalhes };
    case "respondeu": case "contato_realizado":
      return { ...comum, contato: "sim", resposta: "sim", resultado: resposta || "Paciente respondeu", situacao: "informativo", feito: p.acao, detalhes };
    case "orientacao":
      return { ...comum, contato: "sim", resposta: "sim", resultado: resposta, situacao: "informativo", feito: obs ? `${p.acao} — orientação: ${obs}` : p.acao, detalhes };
    case "nova_acao":
      return { ...comum, contato: "sim", resposta: "sim", resultado: resposta || "Paciente respondeu", situacao: "pendente", feito: p.acao, ...continuidade, detalhes };
    case "agendou":
      return { ...comum, contato: "sim", resposta: "sim", resultado: resposta || `Agendou para ${dataBr(e.agendadoPara ?? "")}`, situacao: "agendado", agendadoPara: e.agendadoPara, feito: p.acao, detalhes };
    case "resolvido":
      return { ...comum, contato: "sim", resposta: "sim", resultado: resposta, situacao: "resolvido", feito: p.acao, detalhes };
    case "encaminhado_comercial":
      return {
        ...comum, categoria: "encaminhamento", contato: "sim", resposta: "sim", resultado: resposta || "Paciente respondeu", situacao: "encaminhado", feito: p.acao,
        ...continuidade, responsavel: "comercial_externa", detalhes: { ...detalhes, para: "Comercial Externa", ...(obs ? { motivo_encaminhamento: obs } : {}) },
      };
    case "encaminhado_profissional":
      // A concierge registra o relato e encaminha; não avalia. O caso segue até o profissional orientar.
      return {
        ...comum, contato: "sim", resposta: "sim", resultado: resposta || "Paciente respondeu", situacao: "encaminhado", feito: `${p.acao} — encaminhado a ${t(e.atencao?.profissional) || "profissional"}`,
        ...continuidade, responsavel: /larissa/i.test(e.atencao?.profissional ?? "") ? "dra_larissa" : e.responsavel, detalhes: { ...detalhes, para: t(e.atencao?.profissional) || "Profissional" },
      };
    case "pagamento_confirmado":
      return { ...comum, contato: "sim", resposta: "sim", resultado: resposta ? `Pagamento confirmado — ${resposta}` : "Pagamento confirmado no Simples Dental", situacao: "resolvido", feito: p.acao, detalhes: { ...detalhes, pagamento_confirmado: "sim" } };
    case "promessa_pagamento":
      return { ...comum, contato: "sim", resposta: "sim", resultado: resposta ? `Promessa de pagamento — ${resposta}` : "Promessa de pagamento (não é recebimento)", situacao: "aguardando", feito: p.acao, ...continuidade, detalhes };
    case "negociacao":
      return { ...comum, contato: "sim", resposta: "sim", resultado: resposta ? `Pediu negociação — ${resposta}` : "Pediu negociação", situacao: "aguardando_gestao", pergunta: t(e.pergunta), prazo: e.prazo, feito: p.acao, detalhes };
    case "encaminhado_gestao":
      return { ...comum, contato: "sim", resposta: "sim", resultado: resposta || "Paciente respondeu", situacao: "aguardando_gestao", pergunta: t(e.pergunta), prazo: e.prazo, feito: p.acao, detalhes };
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

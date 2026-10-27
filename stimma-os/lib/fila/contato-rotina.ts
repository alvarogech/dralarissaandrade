import type { ItemRotina, ResultadoContato } from "./rotina-itens";
import type { EntradaRegistro } from "./registro";

/**
 * Contato com paciente feito a partir de uma atividade da rotina (tipo B). Puro: traduz o resultado
 * rápido escolhido pela concierge para os campos do registro do dia que já existem (contato,
 * resposta, situação, próxima ação) — nenhuma enumeração nova vai ao banco. A ligação com a
 * atividade fica em `detalhes.rotina_item` (e o marco em `detalhes.marco`), o que permite contar
 * as pacientes da atividade, montar o fechamento e evitar repetir o mesmo marco sem motivo.
 *
 * "Feito" na atividade = a ação foi executada; não quer dizer caso resolvido: "aguardando resposta"
 * deixa o contato registrado e uma próxima ação aberta, com data.
 */
export const ROTULO_RESULTADO: Record<ResultadoContato, string> = {
  contato_realizado: "Contato realizado",
  mensagem_enviada: "Mensagem enviada",
  aguardando_resposta: "Aguardando resposta",
  nao_respondeu: "Não consegui falar / não respondeu",
  agendou: "Agendamento realizado",
  encaminhado_comercial: "Encaminhado à comercial",
  resolvido: "Resolvido",
  nova_acao: "Necessita nova ação",
  pagamento_confirmado: "Pagamento confirmado",
  promessa_pagamento: "Promessa de pagamento",
  negociacao: "Negociação solicitada",
  encaminhado_gestao: "Encaminhado à gestão",
};

/** O que cada resultado pede além da paciente (para mostrar só os campos necessários). */
export interface CamposResultado {
  /** Próxima ação + data (o caso continua aberto). */
  continuidade: boolean;
  /** Data da consulta agendada. */
  agendamento: boolean;
  /** Pergunta para a gestão. */
  pergunta: boolean;
  /** Observação obrigatória (resolvido sem resposta descrita). */
  observacaoObrigatoria: boolean;
  /** Rótulo do campo de data quando há continuidade. */
  rotuloData: string;
  proximaPadrao: string;
}

export function camposDoResultado(r: ResultadoContato): CamposResultado {
  const base: CamposResultado = { continuidade: false, agendamento: false, pergunta: false, observacaoObrigatoria: false, rotuloData: "Quando", proximaPadrao: "" };
  switch (r) {
    case "aguardando_resposta": return { ...base, continuidade: true, rotuloData: "Verificar em", proximaPadrao: "Verificar se respondeu" };
    case "nao_respondeu": return { ...base, continuidade: true, rotuloData: "Tentar de novo em", proximaPadrao: "Tentar contato de novo" };
    case "nova_acao": return { ...base, continuidade: true, proximaPadrao: "" };
    case "promessa_pagamento": return { ...base, continuidade: true, rotuloData: "Data prometida", proximaPadrao: "Confirmar o pagamento no Simples Dental" };
    case "encaminhado_comercial": return { ...base, continuidade: true, rotuloData: "Retorno da comercial até", proximaPadrao: "Contato da comercial externa" };
    case "agendou": return { ...base, agendamento: true };
    case "negociacao": case "encaminhado_gestao": return { ...base, pergunta: true, rotuloData: "Preciso da resposta até" };
    case "resolvido": return { ...base, observacaoObrigatoria: true };
    default: return base;
  }
}

export interface EntradaContato {
  eventoId: string;
  item: ItemRotina;
  resultado: ResultadoContato;
  pacienteId?: string | null;
  /** Nome digitado quando a paciente não está no cadastro (nunca se inventa identificador). */
  nomeNovo?: string;
  observacao?: string;
  proximaAcao?: string;
  prazo?: string;
  agendadoPara?: string;
  pergunta?: string;
  /** Responsável pela próxima ação ("perfil:<uuid>" | comercial_externa | gestao). */
  responsavel: string;
  canal?: string;
  /** Repetir um marco já registrado para a mesma paciente: motivo obrigatório. */
  justificativaRepeticao?: string;
}

const dataBr = (iso: string) => iso.split("-").reverse().join("/");
const t = (v?: string) => (v ?? "").trim();

/** Validação junto do campo (o servidor revalida tudo). Retorna [campo, mensagem]. */
export function validarContato(e: Omit<EntradaContato, "eventoId" | "item">, hoje: string): [string, string][] {
  const erros: [string, string][] = [];
  if (!e.pacienteId && !t(e.nomeNovo)) erros.push(["paciente", "Informe a paciente: escolha no cadastro ou digite o nome."]);
  const c = camposDoResultado(e.resultado);
  if (c.continuidade) {
    if (!t(e.proximaAcao)) erros.push(["proxima", "Escreva o próximo passo."]);
    if (!e.prazo || e.prazo < hoje) erros.push(["prazo", "Escolha a data (hoje ou depois)."]);
  }
  if (c.agendamento && !e.agendadoPara) erros.push(["agendadoPara", "Informe a data da consulta agendada."]);
  if (c.pergunta) {
    if (!t(e.pergunta)) erros.push(["pergunta", "Escreva o que a gestão precisa decidir."]);
    if (!e.prazo || e.prazo < hoje) erros.push(["prazo", "Escolha até quando precisa da resposta."]);
  }
  if (c.observacaoObrigatoria && !t(e.observacao)) erros.push(["observacao", "Conte em poucas palavras o que ficou resolvido."]);
  return erros;
}

/** Monta a entrada do registro do dia (mesmo endpoint e regras de qualquer registro). */
export function registroDoContato(e: EntradaContato): Omit<EntradaRegistro, "data"> {
  const p = e.item.pacientes!;
  const obs = t(e.observacao);
  const detalhes: Record<string, string> = { rotina_item: e.item.key, resultado_rotina: e.resultado, acao: p.acao };
  if (p.marco) detalhes.marco = p.marco;
  if (t(e.justificativaRepeticao)) detalhes.justificativa_repeticao = t(e.justificativaRepeticao);
  const comum = {
    eventoId: e.eventoId, alvos: [] as EntradaRegistro["alvos"], categoria: p.categoria,
    pacienteId: e.pacienteId || null, novoPaciente: !e.pacienteId && t(e.nomeNovo) ? { nome: t(e.nomeNovo) } : undefined,
    contexto: e.item.curto ?? p.acao, canal: e.canal,
  };
  const continuidade = { proximaAcao: t(e.proximaAcao), prazo: e.prazo, responsavel: e.responsavel };
  switch (e.resultado) {
    case "mensagem_enviada":
      return { ...comum, contato: "sim", resposta: "na", situacao: "informativo", feito: obs ? `${p.acao}: ${obs}` : p.acao, detalhes };
    case "contato_realizado":
      return { ...comum, contato: "sim", resposta: "sim", resultado: obs || "Contato realizado", situacao: "informativo", feito: p.acao, detalhes };
    case "aguardando_resposta":
      return { ...comum, contato: "sim", resposta: "nao", situacao: "aguardando", feito: obs ? `${p.acao}: ${obs}` : p.acao, ...continuidade, detalhes };
    case "nao_respondeu":
      return { ...comum, contato: "nao", resposta: "na", situacao: "pendente", feito: obs ? `${p.acao} — tentativa: ${obs}` : `${p.acao} — tentativa sem sucesso`, ...continuidade, detalhes };
    case "nova_acao":
      return { ...comum, contato: "sim", resposta: obs ? "sim" : "na", resultado: obs || undefined, situacao: "pendente", feito: p.acao, ...continuidade, detalhes };
    case "agendou":
      return { ...comum, contato: "sim", resposta: "sim", resultado: obs || `Agendou para ${dataBr(e.agendadoPara ?? "")}`, situacao: "agendado", agendadoPara: e.agendadoPara, feito: p.acao, detalhes };
    case "resolvido":
      return { ...comum, contato: "sim", resposta: "sim", resultado: obs, situacao: "resolvido", feito: p.acao, detalhes };
    case "encaminhado_comercial":
      return {
        ...comum, categoria: "encaminhamento", contato: "sim", resposta: obs ? "sim" : "na", resultado: obs || undefined, situacao: "encaminhado", feito: p.acao,
        ...continuidade, responsavel: "comercial_externa", detalhes: { ...detalhes, para: "Comercial Externa", ...(obs ? { motivo_encaminhamento: obs } : {}) },
      };
    case "pagamento_confirmado":
      return { ...comum, contato: "sim", resposta: "sim", resultado: obs ? `Pagamento confirmado — ${obs}` : "Pagamento confirmado no Simples Dental", situacao: "resolvido", feito: p.acao, detalhes: { ...detalhes, pagamento_confirmado: "sim" } };
    case "promessa_pagamento":
      return { ...comum, contato: "sim", resposta: "sim", resultado: obs ? `Promessa de pagamento — ${obs}` : "Promessa de pagamento (não é recebimento)", situacao: "aguardando", feito: p.acao, ...continuidade, detalhes };
    case "negociacao":
      return { ...comum, contato: "sim", resposta: "sim", resultado: obs ? `Pediu negociação — ${obs}` : "Pediu negociação", situacao: "aguardando_gestao", pergunta: t(e.pergunta), prazo: e.prazo, feito: p.acao, detalhes };
    case "encaminhado_gestao":
      return { ...comum, contato: "sim", resposta: obs ? "sim" : "na", resultado: obs || undefined, situacao: "aguardando_gestao", pergunta: t(e.pergunta), prazo: e.prazo, feito: p.acao, detalhes };
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

import type { FeedbackRow } from "./store";

/**
 * "Meu dia" da concierge — percurso guiado em três etapas (rotina → pendências → finalizar).
 * Puro: o estado do expediente e a próxima ação saem só do que está gravado (rotina, registros do
 * dia, versões do feedback). Navegar entre etapas nunca é bloqueado; só o envio do feedback é uma
 * ação de verdade, e ele não depende de expediente configurado (a configuração serve apenas para
 * a gestão saber quando cobrar).
 */
export const ETAPAS_MEU_DIA = [
  { id: "rotina", titulo: "Minha rotina", curto: "Rotina" },
  { id: "pendencias", titulo: "Pendências e acompanhamentos", curto: "Pendências" },
  { id: "finalizar", titulo: "Finalizar meu dia", curto: "Finalizar" },
] as const;
export type EtapaMeuDia = (typeof ETAPAS_MEU_DIA)[number]["id"];

export function etapaDaQuery(v: string | undefined | null): EtapaMeuDia | null {
  return ETAPAS_MEU_DIA.some((e) => e.id === v) ? (v as EtapaMeuDia) : null;
}

export type EstadoExpediente =
  | { tipo: "nao_iniciado" }
  | { tipo: "em_andamento" }
  | { tipo: "enviado"; em: string; versao: number; mudouDepois: boolean }
  | { tipo: "ajuste_solicitado"; em: string; versao: number; observacao: string | null };

export interface EntradaMeuDia {
  /** Itens da rotina de hoje com qualquer resposta (feito, não se aplica, impedimento). */
  rotinaRespondidos: number;
  rotinaTotal: number;
  rotinaImpedimentos: number;
  /** Registros da concierge hoje (ids, para saber se mudou algo depois do envio). */
  eventosHoje: string[];
  /** Assinatura atual da rotina (mesma do feedback). */
  rotinaAssinatura: string;
  versoes: FeedbackRow[];
  atrasadas: number;
  paraHoje: number;
  aguardandoGestao: number;
}

export function estadoExpediente(e: EntradaMeuDia): EstadoExpediente {
  const entregue = [...e.versoes].filter((v) => v.status === "entregue").sort((a, b) => b.versao - a.versao)[0];
  const maisNova = [...e.versoes].sort((a, b) => b.versao - a.versao)[0];
  if (entregue && maisNova?.id === entregue.id) {
    if (entregue.ajusteSolicitadoEm) return { tipo: "ajuste_solicitado", em: entregue.entregueEm!, versao: entregue.versao, observacao: entregue.observacaoGestao };
    const mudouDepois = [...entregue.eventos].sort().join(",") !== [...e.eventosHoje].sort().join(",")
      || String(entregue.contadores.rotina_assinatura ?? "") !== e.rotinaAssinatura;
    return { tipo: "enviado", em: entregue.entregueEm!, versao: entregue.versao, mudouDepois };
  }
  if (e.rotinaRespondidos > 0 || e.eventosHoje.length > 0 || e.versoes.length > 0) return { tipo: "em_andamento" };
  return { tipo: "nao_iniciado" };
}

const hora = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** Rótulo curto do estado, para a própria concierge (sem termos de configuração). */
export function textoEstadoExpediente(s: EstadoExpediente): string {
  switch (s.tipo) {
    case "nao_iniciado": return "Não iniciado";
    case "em_andamento": return "Em andamento";
    case "enviado": return `Feedback enviado às ${hora(s.em)}`;
    case "ajuste_solicitado": return "A gestão pediu um ajuste";
  }
}

export interface ProximaAcao {
  etapa: EtapaMeuDia;
  titulo: string;
  texto: string;
  /** Botão principal: "Começar meu dia" · "Continuar meu trabalho" · "Ver feedback enviado" (ou o pedido de ajuste). */
  botao: string;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** O que fazer agora — uma recomendação só, pela situação real; a concierge pode ir a qualquer etapa. */
export function proximaAcao(e: EntradaMeuDia, s: EstadoExpediente = estadoExpediente(e)): ProximaAcao {
  if (s.tipo === "ajuste_solicitado") {
    return { etapa: "finalizar", titulo: "A gestão pediu um ajuste no seu feedback", texto: s.observacao ? `“${s.observacao}”` : "Confira o pedido, ajuste o que for preciso e envie a versão corrigida.", botao: "Ver o pedido da gestão" };
  }
  if (s.tipo === "enviado") {
    if (s.mudouDepois) return { etapa: "finalizar", titulo: "Você registrou algo depois de enviar o feedback", texto: "Se quiser que a gestão veja, envie a versão atualizada. A anterior fica guardada.", botao: "Ver feedback enviado" };
    const resto = e.atrasadas ? ` Ainda há ${plural(e.atrasadas, "pendência atrasada", "pendências atrasadas")}: elas continuam na sua lista amanhã.` : "";
    return { etapa: "finalizar", titulo: "Seu feedback de hoje foi enviado", texto: `A gestão já pode ver o resumo do seu dia.${resto}`, botao: "Ver feedback enviado" };
  }
  const botao = s.tipo === "nao_iniciado" ? "Começar meu dia" : "Continuar meu trabalho";
  if (e.rotinaRespondidos === 0) {
    return { etapa: "rotina", titulo: "Comece pela sua rotina", texto: "Marque o que já fez do início do dia. Cada marcação é salva na hora.", botao };
  }
  if (e.atrasadas > 0) {
    return { etapa: "pendencias", titulo: `Você tem ${plural(e.atrasadas, "pendência atrasada", "pendências atrasadas")}`, texto: "Comece por elas: abra a pendência e registre o que aconteceu.", botao };
  }
  if (e.paraHoje > 0) {
    return { etapa: "pendencias", titulo: `${plural(e.paraHoje, "acompanhamento vence", "acompanhamentos vencem")} hoje`, texto: "Abra cada um e registre o resultado do contato.", botao };
  }
  const faltam = e.rotinaTotal - e.rotinaRespondidos;
  if (faltam > 0) {
    return { etapa: "rotina", titulo: `Faltam ${plural(faltam, "atividade", "atividades")} da rotina`, texto: "Marque como feito, não se aplica ou com impedimento.", botao };
  }
  return { etapa: "finalizar", titulo: "Tudo registrado por hoje", texto: "Revise o resumo do seu dia e envie o feedback para a gestão.", botao };
}

import type { FeedbackRow, FilaConfig } from "./store";

/**
 * Situação da entrega do feedback do dia, pelo expediente configurado no fuso America/Sao_Paulo.
 * Sem configuração não há cobrança: a gestão vê "Expediente não configurado" e ninguém é dado
 * como atrasado. Copiar o texto não conta como entrega.
 */
export type SituacaoEntrega =
  | { tipo: "nao_configurado" }
  | { tipo: "sem_expediente" }
  | { tipo: "prevista"; ate: string }
  | { tipo: "pendente"; desde: string }
  | { tipo: "entregue"; em: string; versao: number; ajusteSolicitado: boolean };

export function agoraSaoPaulo(agora: Date = new Date()): { dia: string; hora: string; diaSemana: number } {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" })
      .formatToParts(agora).map((p) => [p.type, p.value]),
  );
  const dias = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return { dia: `${partes.year}-${partes.month}-${partes.day}`, hora: `${partes.hour}:${partes.minute}`, diaSemana: dias.indexOf(partes.weekday!) };
}

export function expedienteConfigurado(c: FilaConfig): boolean {
  return !!c.diasExpediente?.length && !!c.horarioFechamento;
}

export function temExpediente(c: FilaConfig, dia: string, diaSemana: number): boolean {
  return !!c.diasExpediente?.includes(diaSemana) && !c.excecoes.includes(dia);
}

/** `entregas` = versões do dia daquele responsável (qualquer ordem). */
export function situacaoEntrega(c: FilaConfig, entregas: FeedbackRow[], agora: Date = new Date()): SituacaoEntrega {
  const entregue = entregas.filter((f) => f.status === "entregue").sort((a, b) => b.versao - a.versao)[0];
  if (entregue) return { tipo: "entregue", em: entregue.entregueEm!, versao: entregue.versao, ajusteSolicitado: !!entregue.ajusteSolicitadoEm && !entregas.some((f) => f.versao > entregue.versao && f.status === "entregue") };
  if (!expedienteConfigurado(c)) return { tipo: "nao_configurado" };
  const sp = agoraSaoPaulo(agora);
  if (!temExpediente(c, sp.dia, sp.diaSemana)) return { tipo: "sem_expediente" };
  return sp.hora < c.horarioFechamento! ? { tipo: "prevista", ate: c.horarioFechamento! } : { tipo: "pendente", desde: c.horarioFechamento! };
}

export function textoSituacaoEntrega(s: SituacaoEntrega): string {
  switch (s.tipo) {
    case "nao_configurado": return "Expediente não configurado";
    case "sem_expediente": return "Sem expediente hoje";
    case "prevista": return `Entrega prevista para hoje (até ${s.ate})`;
    case "pendente": return `Feedback pendente (fechamento às ${s.desde})`;
    case "entregue": {
      const h = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(s.em));
      return `Entregue às ${h} · versão ${s.versao}${s.ajusteSolicitado ? " · ajuste solicitado" : ""}`;
    }
  }
}

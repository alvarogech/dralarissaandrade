import type { NormalizedAppointment } from "@/lib/sync/types";
import { ErroRegra, type Ator } from "./servico";
import type { FilaStore } from "./store";

/**
 * Botão "Sincronizar agenda": a leitura acontece no navegador de quem clica (favorito
 * "STIMMA · Copiar agenda" na agenda do Simples Dental — ver agenda-favorito.ts), e o texto copiado
 * é colado aqui. O servidor valida, converte para o formato do motor de sync (lib/sync, idempotente
 * pelo id da consulta) e grava com a autoria do usuário logado — sem segredo compartilhado.
 * Nada é escrito no Simples Dental. Status desconhecido não é adivinhado: o item volta como recusado.
 */
export const FORMATO_AGENDA = "stimma-agenda-v1";
const MAX_ITENS = 300;

/** Texto de status exibido no Simples Dental → status do STIMMA OS. */
const STATUS: [RegExp, NormalizedAppointment["status"]][] = [
  [/^confirmad/i, "confirmed"],
  [/^em atendimento/i, "confirmed"],
  [/^(finalizad|atendid|conclu)/i, "completed"],
  [/^cancelad/i, "cancelled"],
  [/^(falt|não compareceu|nao compareceu)/i, "no_show"],
  [/^remarcad/i, "rescheduled"],
  [/^(agendad|aguardando|não confirmad|nao confirmad|marcad)/i, "scheduled"],
];

export interface AgendaColada {
  itens: NormalizedAppointment[];
  recusados: { paciente: string; motivo: string }[];
  lidoEm: string | null;
}

const texto = (v: unknown, max = 160) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function lerAgendaColada(bruto: string): AgendaColada {
  let j: unknown;
  try {
    j = JSON.parse(bruto);
  } catch {
    throw new ErroRegra("O texto colado não é o resultado do favorito “STIMMA · Copiar agenda”. Abra a agenda do Simples Dental, clique no favorito e cole de novo.");
  }
  const o = (j ?? {}) as { formato?: unknown; lido_em?: unknown; itens?: unknown };
  if (o.formato !== FORMATO_AGENDA || !Array.isArray(o.itens)) throw new ErroRegra("Formato não reconhecido: use o texto copiado pelo favorito “STIMMA · Copiar agenda”.");
  if (!o.itens.length) throw new ErroRegra("Nenhuma consulta de paciente foi encontrada na tela do Simples Dental (confira se a agenda de hoje e amanhã está aberta, na visão Dia ou Semana).");
  if (o.itens.length > MAX_ITENS) throw new ErroRegra(`No máximo ${MAX_ITENS} consultas por vez.`);
  const itens: NormalizedAppointment[] = [];
  const recusados: AgendaColada["recusados"] = [];
  for (const x of o.itens as Record<string, unknown>[]) {
    const paciente = texto(x?.paciente, 120);
    const id = texto(x?.id, 40);
    const ini = texto(x?.inicio, 40);
    const fim = texto(x?.fim, 40);
    const statusSd = texto(x?.status, 60);
    if (!paciente || !/^\d{1,20}$/.test(id) || Number.isNaN(Date.parse(ini)) || Number.isNaN(Date.parse(fim))) {
      recusados.push({ paciente: paciente || "(sem nome)", motivo: "dados incompletos na tela (nome, horário ou identificador)" });
      continue;
    }
    const status = STATUS.find(([re]) => re.test(statusSd))?.[1];
    if (!status) {
      recusados.push({ paciente, motivo: `status “${statusSd || "vazio"}” não reconhecido — confira no Simples Dental` });
      continue;
    }
    const profissional = texto(x?.profissional, 80);
    const nascimento = texto(x?.nascimento, 10);
    const motivo = texto(x?.motivo, 120);
    itens.push({
      source: "simples_dental_browser", sdAppointmentId: id, patient: { fullName: paciente, ...(/^\d{4}-\d{2}-\d{2}$/.test(nascimento) ? { birthDate: nascimento } : {}) },
      startsAt: new Date(ini).toISOString(), endsAt: new Date(fim).toISOString(), status,
      reason: [motivo, profissional ? `Dr(a). ${profissional}` : "", /^em atendimento/i.test(statusSd) ? "em atendimento" : ""].filter(Boolean).join(" · "),
      requiresPayment: false,
    });
  }
  return { itens, recusados, lidoEm: typeof o.lido_em === "string" ? o.lido_em : null };
}

export async function sincronizarAgendaColada(store: FilaStore, ator: Ator, bruto: string) {
  const lido = lerAgendaColada(bruto);
  if (!lido.itens.length) return { total: 0, created: 0, updated: 0, unchanged: 0, requiresReview: 0, recusados: lido.recusados };
  const r = await store.sincronizarAgenda(lido.itens, ator.email);
  return { ...r, recusados: lido.recusados };
}

import { hojeSaoPaulo, somarDias } from "./datas";
import type { CompromissoAgenda, FilaStore } from "./store";

/**
 * Agenda de hoje e amanhã — SOMENTE LEITURA dos compromissos que o sync já trouxe do Simples
 * Dental (appointments com origem simples_dental_browser). Nada é inventado, confirmado ou
 * remarcado aqui. Sem sincronização no dia, a tela manda conferir no Simples Dental.
 */
export interface AgendaCarregada {
  hoje: string;
  amanha: string;
  itensHoje: CompromissoAgenda[];
  itensAmanha: CompromissoAgenda[];
  ultimaSync: string | null;
  /** Houve sincronização concluída hoje (fuso de Brasília). */
  atualizada: boolean;
  /** Minutos desde a última sincronização concluída (null = nunca sincronizou). */
  minutosDesdeSync: number | null;
}

/** Acima disso, mesmo sincronizada hoje, a agenda é mostrada como "pode ter mudado". */
export const AGENDA_RECENTE_MINUTOS = 240;

export async function carregarAgenda(store: FilaStore, hoje = hojeSaoPaulo()): Promise<AgendaCarregada> {
  const amanha = somarDias(hoje, 1);
  const { itens, ultimaSync } = await store.agenda(hoje, amanha);
  const dia = (iso: string) => hojeSaoPaulo(new Date(iso));
  return {
    hoje, amanha,
    itensHoje: itens.filter((i) => dia(i.inicio) === hoje),
    itensAmanha: itens.filter((i) => dia(i.inicio) === amanha),
    ultimaSync,
    atualizada: !!ultimaSync && dia(ultimaSync) === hoje,
    minutosDesdeSync: ultimaSync && !Number.isNaN(Date.parse(ultimaSync)) ? Math.max(0, Math.round((Date.now() - Date.parse(ultimaSync)) / 60_000)) : null,
  };
}

export const ROTULO_STATUS_AGENDA: Record<CompromissoAgenda["status"], string> = {
  scheduled: "Agendado (confirmação pendente)", confirmed: "Confirmado", completed: "Finalizado", cancelled: "Cancelado", no_show: "Falta", rescheduled: "Remarcado",
};

/** Situações que pedem atenção da concierge (o estado vem sempre em texto). */
export function exigeAtencao(c: CompromissoAgenda): boolean {
  return c.revisar || c.status === "scheduled" || c.status === "no_show" || c.status === "cancelled" || c.status === "rescheduled";
}

/**
 * Pós-procedimento: dias desde o último dia útil até ontem (na segunda, sexta + fim de semana, para
 * nada feito antes do fim de semana ser esquecido). Mostra as consultas sincronizadas desses dias
 * que não foram canceladas, remarcadas nem faltadas, com o status da última leitura — nunca afirma
 * que houve procedimento nem que o contato está pendente: a conferência é no Simples Dental.
 */
export function diasDoPosProcedimento(hoje: string): string[] {
  const dias: string[] = [];
  for (let d = somarDias(hoje, -1); ; d = somarDias(d, -1)) {
    dias.unshift(d);
    const [y, m, dd] = d.split("-").map(Number) as [number, number, number];
    const dow = new Date(y, m - 1, dd).getDay();
    if (dow !== 0 && dow !== 6) return dias;
    if (dias.length > 4) return dias;
  }
}

export async function posProcedimento(store: FilaStore, hoje = hojeSaoPaulo()) {
  const dias = diasDoPosProcedimento(hoje);
  const { itens } = await store.agenda(dias[0]!, dias[dias.length - 1]!);
  return {
    dias,
    itens: itens
      .filter((c) => c.status === "completed" || c.status === "confirmed" || c.status === "scheduled")
      .map((c) => ({ paciente: c.paciente, inicio: c.inicio, status: ROTULO_STATUS_AGENDA[c.status] })),
  };
}

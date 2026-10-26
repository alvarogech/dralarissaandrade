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

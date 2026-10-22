import type { GeneratedAlert } from "./types";

/**
 * Módulo financeiro por paciente (recebíveis, saldos e parcelas sincronizados do Simples Dental)
 * SUSPENSO nesta versão: a fonte ainda não foi validada. Os dados continuam no banco, intactos;
 * só deixam de ser exibidos e de gerar alertas, prioridades e indicadores. Tarefas manuais de
 * cobrança criadas pela gestão não pertencem a este módulo e seguem normalmente na fila.
 * Para reativar: true (e revisar as telas que o consomem).
 */
export const MODULO_FINANCEIRO_ATIVO = false;

export function semFinanceiroSuspenso(alerts: GeneratedAlert[]): GeneratedAlert[] {
  return MODULO_FINANCEIRO_ATIVO ? alerts : alerts.filter((a) => a.category !== "financeiro");
}

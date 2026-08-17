import type { ClinicSnapshot, Receivable } from "./types";

export interface FinancialSummary {
  overdueCount: number;
  overdueTotal: number;
  pendingCount: number;
  pendingTotal: number;
  receivedCount: number;
  receivedTotal: number;
  overdueReceivables: Receivable[];
}

/**
 * Resumo financeiro determinístico a partir dos recebíveis do snapshot —
 * mesma separação de docs/PROJECT_SPEC.md ("Financeiro"): vencido, em
 * aberto (ainda dentro do prazo) e recebido nunca se misturam num único
 * número de "faturamento".
 */
export function summarizeFinancials(snapshot: ClinicSnapshot): FinancialSummary {
  const now = new Date(snapshot.now);
  let overdueCount = 0;
  let overdueTotal = 0;
  let pendingCount = 0;
  let pendingTotal = 0;
  let receivedCount = 0;
  let receivedTotal = 0;
  const overdueReceivables: Receivable[] = [];

  for (const r of snapshot.receivables) {
    if (r.paidAt) {
      receivedCount++;
      receivedTotal += r.amount;
      continue;
    }

    if (new Date(r.dueAt).getTime() < now.getTime()) {
      overdueCount++;
      overdueTotal += r.amount;
      overdueReceivables.push(r);
    } else {
      pendingCount++;
      pendingTotal += r.amount;
    }
  }

  return { overdueCount, overdueTotal, pendingCount, pendingTotal, receivedCount, receivedTotal, overdueReceivables };
}

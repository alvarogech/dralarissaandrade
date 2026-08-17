import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { FinancialSummary as FinancialSummaryData } from "@/lib/rules/financial-summary";

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function FinancialSummary({
  summary,
  patientNameById,
}: {
  summary: FinancialSummaryData;
  patientNameById: Map<string, string>;
}) {
  const hasAnything = summary.overdueCount + summary.pendingCount + summary.receivedCount > 0;

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">
        Financeiro
      </h2>
      <Card>
        {!hasAnything ? (
          <p className="text-sm text-text-secondary">
            Nenhum recebível sincronizado ainda — rode <code>/sync-agenda</code> ou importe o
            financeiro do Simples Dental.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-text-muted">Vencido</p>
                <p className="mt-1 text-lg font-medium text-critical">
                  {formatBRL(summary.overdueTotal)}
                </p>
                <p className="text-xs text-text-muted">{summary.overdueCount} recebível(is)</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-text-muted">Em aberto</p>
                <p className="mt-1 text-lg font-medium text-text-primary">
                  {formatBRL(summary.pendingTotal)}
                </p>
                <p className="text-xs text-text-muted">{summary.pendingCount} recebível(is)</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-text-muted">Recebido</p>
                <p className="mt-1 text-lg font-medium text-opportunity">
                  {formatBRL(summary.receivedTotal)}
                </p>
                <p className="text-xs text-text-muted">{summary.receivedCount} recebível(is)</p>
              </div>
            </div>

            {summary.overdueReceivables.length > 0 && (
              <ul className="mt-4 flex flex-col divide-y divide-border border-t border-border pt-2">
                {summary.overdueReceivables.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-4 py-2">
                    <span className="text-sm text-text-primary">
                      {patientNameById.get(r.patientId) ?? "Paciente"}
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge variant="critical">{formatBRL(r.amount)}</Badge>
                      <span className="text-xs text-text-muted">
                        venceu {new Date(r.dueAt).toLocaleDateString("pt-BR")}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>
    </section>
  );
}

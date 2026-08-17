import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { sortAlertsByPriority } from "@/lib/rules/engine";
import type { GeneratedAlert } from "@/lib/rules/types";

const PRIORITY_ICON: Record<GeneratedAlert["priority"], string> = {
  critical: "🔴",
  important: "🟠",
  opportunity: "🟡",
  informative: "🔵",
};

const PRIORITY_VARIANT: Record<GeneratedAlert["priority"], "critical" | "important" | "opportunity" | "informative"> = {
  critical: "critical",
  important: "important",
  opportunity: "opportunity",
  informative: "informative",
};

export function NeedsYou({ alerts }: { alerts: GeneratedAlert[] }) {
  const sorted = sortAlertsByPriority(alerts);

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">
        Precisa de você
      </h2>

      {sorted.length === 0 ? (
        <Card>
          <p className="text-sm text-text-secondary">
            Nada crítico agora. A operação está sob controle.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((alert) => (
            <Card key={alert.id} className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span aria-hidden>{PRIORITY_ICON[alert.priority]}</span>
                <div>
                  <p className="text-sm font-medium text-text-primary">{alert.title}</p>
                  <p className="mt-0.5 text-sm text-text-secondary">{alert.recommendedAction}</p>
                  {alert.financialImpact !== null && (
                    <p className="mt-1 text-xs text-text-muted">
                      Impacto estimado:{" "}
                      {alert.financialImpact.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </p>
                  )}
                </div>
              </div>
              <Badge variant={PRIORITY_VARIANT[alert.priority]}>{alert.assignedToRole}</Badge>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

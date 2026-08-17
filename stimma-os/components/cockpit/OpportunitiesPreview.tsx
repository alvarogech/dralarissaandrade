import { Card } from "@/components/ui/Card";
import type { GeneratedOpportunity } from "@/lib/rules/types";

export function OpportunitiesPreview({
  opportunities,
}: {
  opportunities: GeneratedOpportunity[];
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">
        Oportunidades detectadas
      </h2>
      <Card>
        {opportunities.length === 0 ? (
          <p className="text-sm text-text-secondary">Nenhuma oportunidade nova.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {opportunities.map((o) => (
              <li key={o.id} className="text-sm">
                <span className="font-medium text-text-primary">{o.title}</span>
                <span className="ml-2 text-xs uppercase tracking-wide text-text-muted">
                  urgência {o.urgency}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}

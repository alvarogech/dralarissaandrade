import { Card } from "@/components/ui/Card";

export function PriorityList({
  priorities,
}: {
  priorities: Array<{ title: string; action: string }>;
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">
        Suas 3 prioridades hoje
      </h2>
      <Card>
        {priorities.length === 0 ? (
          <p className="text-sm text-text-secondary">
            Sem prioridades geradas ainda — a operação está tranquila hoje.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {priorities.map((p, i) => (
              <li key={p.title} className="flex gap-3">
                <span className="font-serif text-lg text-accent">{i + 1}</span>
                <div>
                  <p className="text-sm font-medium text-text-primary">{p.title}</p>
                  <p className="text-sm text-text-secondary">{p.action}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </section>
  );
}

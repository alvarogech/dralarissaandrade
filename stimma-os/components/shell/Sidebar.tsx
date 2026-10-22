import Link from "next/link";

const PRIMARY_NAV = [
  { label: "Feedback diário", href: "/fila" },
  { label: "Fechamento", href: "/fechamento" },
  { label: "Gestão", href: "/entrada" },
  { label: "Hoje", href: "/hoje" },
  { label: "Pipeline", href: "/pipeline" },
  { label: "Agenda", href: null },
  { label: "Pacientes", href: null },
  { label: "Oportunidades", href: null },
  { label: "Financeiro", href: null },
  { label: "Tarefas", href: null },
  { label: "Equipe", href: null },
  { label: "Relatórios", href: null },
  { label: "Atividade", href: null },
] as const;

const SECONDARY_NAV = ["STIMMA AI", "Automações", "Integrações", "Configurações"] as const;

export function Sidebar({ current }: { current?: string }) {
  return (
    <aside className="hidden w-56 shrink-0 flex-col gap-8 border-r border-border px-4 py-6 md:flex">
      <div>
        <p className="text-sm font-semibold tracking-wide text-text-primary">STIMMA OS</p>
        <p className="text-xs text-text-muted">Clínica Stimma</p>
      </div>

      <nav className="flex flex-col gap-0.5">
        {PRIMARY_NAV.map((item) => {
          const isActive = item.label === current;
          const className = isActive
            ? "rounded-sm bg-accent-soft px-3 py-1.5 text-sm font-medium text-text-primary"
            : "rounded-sm px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-raised";

          if (!item.href) {
            // Ainda não implementado: visivelmente indisponível, sem simular um link.
            return (
              <span key={item.label} aria-disabled="true" title="Ainda não disponível" className="flex cursor-not-allowed items-center justify-between rounded-sm px-3 py-1.5 text-sm text-text-muted opacity-70">
                {item.label}
                <span className="text-[10px] uppercase tracking-wide">em breve</span>
              </span>
            );
          }

          return (
            <Link key={item.label} href={item.href} className={className}>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <nav className="mt-auto flex flex-col gap-0.5 border-t border-border pt-4">
        {SECONDARY_NAV.map((item) => (
          <span key={item} aria-disabled="true" title="Ainda não disponível" className="flex cursor-not-allowed items-center justify-between rounded-sm px-3 py-1.5 text-sm text-text-muted opacity-70">
            {item}
            <span className="text-[10px] uppercase tracking-wide">em breve</span>
          </span>
        ))}
      </nav>
    </aside>
  );
}

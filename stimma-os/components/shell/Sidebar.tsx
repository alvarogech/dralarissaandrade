const PRIMARY_NAV = [
  "Hoje",
  "Agenda",
  "Pacientes",
  "Oportunidades",
  "Financeiro",
  "Tarefas",
  "Equipe",
  "Relatórios",
  "Atividade",
] as const;

const SECONDARY_NAV = ["STIMMA AI", "Automações", "Integrações", "Configurações"] as const;

export function Sidebar() {
  return (
    <aside className="hidden w-56 shrink-0 flex-col gap-8 border-r border-border px-4 py-6 md:flex">
      <div>
        <p className="text-sm font-semibold tracking-wide text-text-primary">STIMMA OS</p>
        <p className="text-xs text-text-muted">Clínica Stimma</p>
      </div>

      <nav className="flex flex-col gap-0.5">
        {PRIMARY_NAV.map((item) => (
          <span
            key={item}
            className={
              item === "Hoje"
                ? "rounded-sm bg-accent-soft px-3 py-1.5 text-sm font-medium text-text-primary"
                : "rounded-sm px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-raised"
            }
          >
            {item}
          </span>
        ))}
      </nav>

      <nav className="mt-auto flex flex-col gap-0.5 border-t border-border pt-4">
        {SECONDARY_NAV.map((item) => (
          <span
            key={item}
            className="rounded-sm px-3 py-1.5 text-sm text-text-muted hover:bg-surface-raised"
          >
            {item}
          </span>
        ))}
      </nav>
    </aside>
  );
}

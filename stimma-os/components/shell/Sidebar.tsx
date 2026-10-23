import Link from "next/link";
import { SairButton } from "@/components/auth/SairButton";

/**
 * Navegação por perfil — só o que funciona (nada de itens "em breve"). A barreira real fica no
 * servidor: cada página e cada rota checa o papel; esconder o menu não é a proteção.
 */
export const NAV_GESTAO = [
  { label: "Trabalho da Gabi", href: "/trabalho" },
  { label: "Entrada e tarefas", href: "/entrada" },
  { label: "Feedbacks da Gabi", href: "/feedbacks" },
] as const;

export const NAV_CONCIERGE = [
  { label: "Meu trabalho", href: "/trabalho" },
  { label: "Feedback diário", href: "/fila" },
] as const;

export function navDoPerfil(gestao: boolean) {
  return gestao ? NAV_GESTAO : NAV_CONCIERGE;
}

export function Sidebar({ current, gestao = true }: { current?: string; gestao?: boolean }) {
  return (
    <aside className="hidden w-56 shrink-0 flex-col gap-8 border-r border-border px-4 py-6 md:flex">
      <div>
        <p className="text-sm font-semibold tracking-wide text-text-primary">STIMMA OS</p>
        <p className="text-xs text-text-muted">Clínica Stimma</p>
      </div>
      <SairButton className="-mt-4 w-full text-left" />

      <nav className="flex flex-col gap-0.5">
        {navDoPerfil(gestao).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={item.label === current
              ? "rounded-sm bg-accent-soft px-3 py-1.5 text-sm font-medium text-text-primary"
              : "rounded-sm px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-raised"}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

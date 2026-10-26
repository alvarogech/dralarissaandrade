import Link from "next/link";
import clsx from "clsx";
import { Marca, Sidebar, navDoPerfil } from "@/components/shell/Sidebar";
import { SairButton } from "@/components/auth/SairButton";

/**
 * Moldura das telas operacionais (tema claro "tema-la", identidade Arquitetura do Olhar).
 * Desktop: coluna grafite fixa + conteúdo em canvas. Celular: barra grafite compacta com a marca
 * e o "Sair", e abas por perfil logo abaixo (sem menu duplicado no mesmo breakpoint).
 */
export function FilaShell({ atual, demo, gestao, largo, children }: { atual: string; demo: boolean; gestao: boolean; largo?: boolean; children: React.ReactNode }) {
  return (
    <div className="tema-la flex min-h-screen">
      <Sidebar current={atual} gestao={gestao} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 md:hidden">
          <div className="flex items-center justify-between bg-graphite px-4 py-3">
            <Marca compacta />
            <SairButton escuro />
          </div>
          <nav className="flex gap-1 overflow-x-auto border-b border-border bg-canvas px-2" aria-label="Navegação principal">
            {navDoPerfil(gestao).map((a) => (
              <Link key={a.href} href={a.href} aria-current={a.label === atual ? "page" : undefined}
                className={clsx("shrink-0 border-b-2 px-3 py-2.5 text-sm", a.label === atual ? "border-accent font-medium text-text-primary" : "border-transparent text-text-secondary")}>
                {a.curto}
              </Link>
            ))}
          </nav>
        </header>
        <main className={clsx("mx-auto w-full min-w-0 flex-1 px-4 py-6 md:px-10 md:py-10", largo ? "max-w-[1320px]" : "max-w-[1040px]")}>
          {demo && (
            <div className="mb-6 rounded-card border border-important bg-important-bg px-4 py-2.5 text-sm text-important">
              Modo demonstração: Supabase não configurado, dados só em memória e fictícios. Nada é gravado no banco.{" "}
              Você está como <strong>{gestao ? "gestão" : "concierge (Gabi)"}</strong> —{" "}
              <a className="underline" href={`/api/fila/demo-papel?papel=${gestao ? "gabi" : "gestao"}`}>ver como {gestao ? "concierge" : "gestão"}</a>.
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

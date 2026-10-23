import Link from "next/link";
import clsx from "clsx";
import { Sidebar, navDoPerfil } from "@/components/shell/Sidebar";
import { SairButton } from "@/components/auth/SairButton";

/**
 * Moldura das telas da fila, no padrão visual do feedback-concierge.html (tema claro
 * "tema-feedback"). Navegação por perfil; no celular a sidebar some e há uma barra de abas própria.
 */
export function FilaShell({ atual, demo, gestao, largo, children }: { atual: string; demo: boolean; gestao: boolean; largo?: boolean; children: React.ReactNode }) {
  return (
    <div className="tema-feedback flex min-h-screen">
      <Sidebar current={atual} gestao={gestao} />
      <main className={clsx("mx-auto w-full min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8", largo ? "max-w-[1260px]" : "max-w-4xl")}>
        <nav className="mb-5 flex items-center gap-1 overflow-x-auto border-b border-border md:hidden">
          {navDoPerfil(gestao).map((a) => (
            <Link key={a.href} href={a.href} className={clsx("shrink-0 px-3 py-2 text-sm", a.label === atual ? "border-b-2 border-accent font-medium text-text-primary" : "text-text-secondary")}>
              {a.label}
            </Link>
          ))}
          <SairButton className="mb-1 ml-auto shrink-0" />
        </nav>
        {demo && (
          <div className="mb-5 rounded-md border border-important bg-important-bg px-4 py-2 text-sm text-important">
            Modo demonstração: Supabase não configurado, dados só em memória e fictícios. Nada é gravado no banco.{" "}
            Você está como <strong>{gestao ? "gestão" : "concierge (Gabi)"}</strong> —{" "}
            <a className="underline" href={`/api/fila/demo-papel?papel=${gestao ? "gabi" : "gestao"}`}>ver como {gestao ? "concierge" : "gestão"}</a>.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

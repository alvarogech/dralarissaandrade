import Link from "next/link";
import clsx from "clsx";
import { Sidebar } from "@/components/shell/Sidebar";

const ABAS = [
  { label: "Feedback diário", atual: "Feedback diário", href: "/fila" },
  { label: "Outros dias", atual: "Fechamento", href: "/fechamento" },
  { label: "Gestão", atual: "Gestão", href: "/entrada", soGestao: true },
] as const;

/**
 * Moldura das telas da fila da concierge, no padrão visual do feedback-concierge.html
 * (tema claro "tema-feedback"). No celular a sidebar some e há uma barra de abas própria.
 */
export function FilaShell({ atual, demo, gestao, children }: { atual: "Feedback diário" | "Fechamento" | "Gestão"; demo: boolean; gestao: boolean; children: React.ReactNode }) {
  return (
    <div className="tema-feedback flex min-h-screen">
      <Sidebar current={atual} />
      <main className={clsx("mx-auto w-full flex-1 px-4 py-6 md:px-8 md:py-8", atual === "Feedback diário" ? "max-w-[1260px]" : "max-w-3xl")}>
        <nav className="mb-5 flex gap-1 border-b border-border md:hidden">
          {ABAS.filter((a) => !("soGestao" in a) || gestao).map((a) => (
            <Link key={a.href} href={a.href} className={a.atual === atual ? "border-b-2 border-accent px-3 py-2 text-sm font-medium text-text-primary" : "px-3 py-2 text-sm text-text-secondary"}>
              {a.label}
            </Link>
          ))}
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

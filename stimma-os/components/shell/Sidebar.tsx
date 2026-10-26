import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";
import { SairButton } from "@/components/auth/SairButton";

/**
 * Navegação por perfil — só o que funciona (nada de itens "em breve"). A barreira real fica no
 * servidor: cada página e cada rota checa o papel; esconder o menu não é a proteção.
 * Visual: coluna grafite com o monograma LA (estrutura), conteúdo em canvas claro (trabalho).
 */
export const NAV_GESTAO = [
  { label: "Trabalho da Gabi", curto: "Trabalho", href: "/trabalho" },
  { label: "Entrada e tarefas", curto: "Entrada", href: "/entrada" },
  { label: "Feedbacks da Gabi", curto: "Feedbacks", href: "/feedbacks" },
] as const;

export const NAV_CONCIERGE = [
  { label: "Meu trabalho", curto: "Meu trabalho", href: "/trabalho" },
  { label: "Feedback diário", curto: "Feedback", href: "/fila" },
] as const;

export function navDoPerfil(gestao: boolean) {
  return gestao ? NAV_GESTAO : NAV_CONCIERGE;
}

export function Marca({ compacta }: { compacta?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Image src="/brand/monograma-la-creme.png" alt="" width={compacta ? 22 : 30} height={compacta ? 24 : 33} priority />
      <div className="leading-tight">
        <p className={clsx("whitespace-nowrap font-serif font-medium uppercase text-cream", compacta ? "text-[13px] tracking-[0.16em]" : "text-[14px] tracking-[0.14em]")}>Larissa Andrade</p>
        {!compacta && <p className="mt-0.5 text-[11px] tracking-[0.12em] text-cream/60">STIMMA OS</p>}
      </div>
    </div>
  );
}

export function Sidebar({ current, gestao = true }: { current?: string; gestao?: boolean }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-graphite px-5 py-7 md:flex" aria-label="Navegação principal">
      <Marca />
      <div className="mt-7 h-px bg-white/10" />
      <p className="mt-6 px-3 text-[11px] font-medium uppercase tracking-[0.14em] text-cream/50">{gestao ? "Gestão" : "Concierge"}</p>
      <nav className="mt-2 flex flex-col gap-0.5">
        {navDoPerfil(gestao).map((item) => {
          const ativo = item.label === current;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={ativo ? "page" : undefined}
              className={clsx(
                "relative rounded-control px-3 py-2 text-[14px] transition-colors",
                ativo ? "bg-white/[0.08] font-medium text-white before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:bg-[#c98d95]" : "text-cream/75 hover:bg-white/5 hover:text-white",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto">
        <div className="mb-3 h-px bg-white/10" />
        <SairButton escuro className="w-full" />
      </div>
    </aside>
  );
}

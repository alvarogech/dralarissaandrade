import Image from "next/image";
import { LoginForm } from "@/components/auth/LoginForm";

/**
 * Login — a única tela com área institucional: painel grafite com o monograma e a assinatura
 * "Arquitetura do Olhar"; o formulário fica em superfície clara, objetivo. No celular o painel
 * vira uma faixa curta no topo para não empurrar o formulário.
 */
export default function LoginPage() {
  return (
    <div className="tema-la grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="relative flex flex-col justify-between overflow-hidden bg-graphite px-6 py-6 text-cream lg:px-16 lg:py-14" aria-label="Larissa Andrade">
        {/* Régua de proporção discreta (1/3) — referência arquitetônica, sem competir com o conteúdo. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
          <div className="absolute inset-y-0 left-1/3 w-px bg-white/[0.06]" />
          <div className="absolute inset-y-0 left-2/3 w-px bg-white/[0.06]" />
          <div className="absolute inset-x-0 top-1/3 h-px bg-white/[0.06]" />
        </div>
        <div className="relative flex items-center gap-4 lg:block">
          <Image src="/brand/monograma-la-creme.png" alt="Monograma LA" width={44} height={48} priority className="lg:h-[86px] lg:w-[79px]" />
          <p className="text-[11px] uppercase tracking-[0.24em] text-cream/60 lg:mt-10">Arquitetura do olhar</p>
        </div>
        <div className="relative hidden lg:block">
          <h1 className="font-serif text-[56px] font-medium uppercase leading-[1.02] tracking-[0.14em]">Larissa<br />Andrade</h1>
          <div className="mt-6 h-px w-24 bg-cream/30" />
          <p className="mt-6 text-[12px] uppercase tracking-[0.22em] text-cream/70">Médica · Estética facial estratégica</p>
        </div>
        <p className="relative hidden max-w-sm font-serif text-[22px] italic leading-snug text-cream/80 lg:block">
          Existe um olhar, uma estrutura e uma inteligência antes de cada decisão.
        </p>
      </section>

      <main className="flex items-start justify-center px-5 py-10 sm:items-center lg:px-16">
        <div className="w-full max-w-[400px]">
          <p className="fb-eyebrow">STIMMA OS · Clínica Stimma</p>
          <h2 className="fb-titulo mt-2">Acesso ao sistema</h2>
          <p className="mt-2 text-sm text-text-secondary">Entre com o e-mail cadastrado pela administração.</p>
          <div className="mt-8 rounded-card border border-border bg-surface p-6 shadow-raised">
            <LoginForm />
          </div>
          <p className="mt-6 text-xs leading-relaxed text-text-muted">
            Não há cadastro público: o acesso só existe quando criado pela administração. Em caso de dúvida, fale com a gestão.
          </p>
        </div>
      </main>
    </div>
  );
}

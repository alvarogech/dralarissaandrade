"use client";

import { useState } from "react";
import clsx from "clsx";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Encerra a sessão no Supabase Auth e vai para o login com `location.replace` — a página
 * protegida sai do histórico, e o "Voltar" cai no middleware, que exige login de novo.
 * Qualquer chamada de API depois da saída responde 401.
 */
export function SairButton({ className, escuro }: { className?: string; escuro?: boolean }) {
  const [saindo, setSaindo] = useState(false);
  const [erro, setErro] = useState(false);

  async function sair() {
    setSaindo(true);
    setErro(false);
    const supabase = createSupabaseBrowserClient();
    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) {
        // Mesmo com falha de rede, a sessão local é descartada; avisamos e seguimos para o login.
        await supabase.auth.signOut({ scope: "local" });
        setErro(true);
      }
    }
    window.location.replace("/login");
  }

  return (
    <button type="button" onClick={sair} disabled={saindo} title={erro ? "Sessão local encerrada" : undefined}
      className={clsx(
        "inline-flex min-h-9 items-center rounded-control px-3 text-sm transition-colors disabled:opacity-60",
        escuro ? "text-cream/80 hover:bg-white/10 hover:text-white" : "border border-border-strong text-text-secondary hover:bg-surface-hover",
        className,
      )}>
      {saindo ? "Saindo…" : "Sair"}
    </button>
  );
}

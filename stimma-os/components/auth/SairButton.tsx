"use client";

import { useState } from "react";
import clsx from "clsx";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Encerra a sessão no Supabase Auth e vai para o login com `location.replace` — a página
 * protegida sai do histórico, e o "Voltar" cai no middleware, que exige login de novo.
 * Qualquer chamada de API depois da saída responde 401.
 */
export function SairButton({ className }: { className?: string }) {
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
      className={clsx("rounded-sm border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-raised disabled:opacity-60", className)}>
      {saindo ? "Saindo…" : "Sair"}
    </button>
  );
}

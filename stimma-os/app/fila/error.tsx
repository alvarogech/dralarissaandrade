"use client";

import { useEffect } from "react";
import { Indisponivel } from "@/components/fila/Indisponivel";

/** Erro inesperado ao renderizar: tela compreensível com "tentar novamente" (detalhe no log). */
export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[fila] erro ao renderizar fila", error.digest ?? "", error);
  }, [error]);
  return (
    <div className="tema-la min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-2xl">
        <Indisponivel titulo="Feedback diário" motivo={`Ocorreu um erro inesperado ao carregar a página${error.digest ? ` (código ${error.digest})` : ""}.`} onTentar={reset} />
      </div>
    </div>
  );
}

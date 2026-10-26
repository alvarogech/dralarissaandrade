"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/Button";

/** Falha numa área da página (não na página toda): motivo legível e "tentar novamente". */
export function AreaIndisponivel({ titulo, motivo }: { titulo: string; motivo: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  return (
    <section role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-card border border-critical bg-critical-bg px-4 py-3">
      <div>
        <p className="text-[14px] font-medium text-critical">{titulo} indisponível</p>
        <p className="text-[13px] text-text-secondary">{motivo}</p>
      </div>
      <Button type="button" variante="secundario" loading={pendente} loadingText="Tentando…" onClick={() => iniciar(() => router.refresh())}>Tentar novamente</Button>
    </section>
  );
}

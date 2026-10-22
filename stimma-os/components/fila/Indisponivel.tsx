"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Estado de indisponibilidade: a consulta falhou (não é "sem dados"). Mostra o motivo legível e
 * permite tentar de novo; o detalhe técnico fica no log do servidor.
 */
export function Indisponivel({ titulo, motivo, onTentar }: { titulo: string; motivo: string; onTentar?: () => void }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  return (
    <div role="alert" className="rounded-[14px] border border-critical bg-critical-bg p-5">
      <p className="font-serif text-[19px] text-critical">{titulo} indisponível no momento</p>
      <p className="mt-1 text-sm text-text-secondary">{motivo}</p>
      <p className="mt-1 text-xs text-text-muted">Nada foi perdido: o que já estava registrado continua no banco.</p>
      <Button type="button" className="mt-3" loading={pendente} loadingText="Tentando…" onClick={() => (onTentar ? onTentar() : iniciar(() => router.refresh()))}>
        Tentar novamente
      </Button>
    </div>
  );
}

"use client";

import { createContext, useContext } from "react";
import type { ItemFila } from "@/lib/fila/agrupamento";

/** Dados compartilhados pelas telas da fila (evita repassar por todos os cartões). */
export interface DadosFila {
  hoje: string;
  proximoDiaUtil: string;
  usuarioId: string;
  perfis: { id: string; nome: string }[];
  pacientes: { id: string; nome: string }[];
  itens: ItemFila[];
  gestao?: boolean;
  conciergeId?: string | null;
  gestorId?: string | null;
}

const Contexto = createContext<DadosFila | null>(null);

export function ProvedorFila({ valor, children }: { valor: DadosFila; children: React.ReactNode }) {
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useDadosFila(): DadosFila {
  const v = useContext(Contexto);
  if (!v) throw new Error("useDadosFila fora do ProvedorFila");
  return v;
}

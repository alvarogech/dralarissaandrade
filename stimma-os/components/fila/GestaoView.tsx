"use client";

import { useState } from "react";
import clsx from "clsx";
import { FeedbackImportView } from "./FeedbackImportView";
import { LevantamentoView, type LinhaEditor } from "./LevantamentoView";
import { TarefasGestaoView } from "./TarefasGestaoView";

type Aba = "levantamento" | "feedback" | "tarefas";

/** Área da gestão: alimentar a fila (levantamento / feedback anterior) e administrar tarefas. */
export function GestaoView({ iaDisponivel }: { iaDisponivel: boolean }) {
  const [aba, setAba] = useState<Aba>("levantamento");
  const [linhas, setLinhasState] = useState<LinhaEditor[]>([]);
  const setLinhas = (f: (l: LinhaEditor[]) => LinhaEditor[]) => setLinhasState(f);

  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" aria-label="Área da entrada" className="flex w-full flex-wrap gap-1 border-b border-border">
        {([["levantamento", `Levantamento${linhas.length ? ` (${linhas.length})` : ""}`], ["feedback", "Feedback anterior"], ["tarefas", "Tarefas"]] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={k === aba} onClick={() => setAba(k)}
            className={clsx("-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm transition-colors", k === aba ? "border-accent font-medium text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary")}>
            {label}
          </button>
        ))}
      </div>
      {!iaDisponivel && (
        <p className="rounded-card border border-border bg-surface-raised p-3 text-[13px] text-text-secondary">
          Conversão de texto livre por IA desativada neste servidor (falta configurar a chave). Funcionam: JSON estruturado, itens manuais e o feedback gerado pela plataforma.
        </p>
      )}
      <div hidden={aba !== "levantamento"}><LevantamentoView linhas={linhas} setLinhas={setLinhas} /></div>
      <div hidden={aba !== "feedback"}>
        <FeedbackImportView adicionarAoLevantamento={(novas) => { setLinhas((ls) => [...ls, ...novas]); setAba("levantamento"); }} />
      </div>
      {aba === "tarefas" && <TarefasGestaoView />}
    </div>
  );
}

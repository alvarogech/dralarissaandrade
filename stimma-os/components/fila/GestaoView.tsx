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
      <div className="flex flex-wrap gap-1">
        {([["levantamento", `Levantamento${linhas.length ? ` (${linhas.length})` : ""}`], ["feedback", "Feedback anterior"], ["tarefas", "Tarefas"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setAba(k)} className={clsx("rounded-sm px-3 py-1.5 text-sm", k === aba ? "bg-accent-soft font-medium text-text-primary" : "text-text-secondary hover:bg-surface-raised")}>
            {label}
          </button>
        ))}
      </div>
      {!iaDisponivel && (
        <p className="rounded-md border border-border p-3 text-xs text-text-secondary">
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

import type { TarefaRow } from "./store";

/**
 * Evento de tarefa sem paciente precisa de assunto (restrição interaction_events_alvo_check): sem
 * ele o banco recusa o histórico — foi o que derrubou o cancelamento de uma tarefa administrativa
 * em 26/10. Com paciente, o assunto fica vazio.
 */
export function assuntoDoEvento(t: Pick<TarefaRow, "patientId" | "assunto" | "title"> | undefined): string | null {
  if (!t || t.patientId) return null;
  return t.assunto?.trim() || t.title?.trim() || "Assunto administrativo";
}

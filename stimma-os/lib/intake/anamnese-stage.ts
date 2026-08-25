import type { PipelineStage } from "@/lib/rules/types";

/**
 * Estágio inicial de uma paciente nova vinda da anamnese — decidido só por
 * dado observável no payload (docs/ANAMNESE_INTAKE.md), nunca por
 * interpretação. Puro e testável sem banco.
 */
export interface AnamneseStageDecision {
  stage: PipelineStage;
  nextAction: string;
}

export function decideAnamneseStage(appointmentDate: string | null): AnamneseStageDecision {
  if (appointmentDate) {
    return { stage: "evaluation_scheduled", nextAction: "Confirmar avaliação agendada" };
  }
  return { stage: "new_lead", nextAction: "Revisar anamnese e entrar em contato" };
}

/** Próximo dia útil (segunda a sexta) a partir de `now` — nunca cai em fim de semana. */
export function nextBusinessDay(now: Date): Date {
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  const day = next.getDay();
  if (day === 6) next.setDate(next.getDate() + 2); // sabado -> segunda
  if (day === 0) next.setDate(next.getDate() + 1); // domingo -> segunda
  return next;
}

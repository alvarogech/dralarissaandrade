import type { Patient, PatientJourney, PipelineStage } from "@/lib/rules/types";

/**
 * Board do pipeline (18 estágios, docs/CRM_MASTER_SPEC.md §5). Puro e
 * testável sem banco — mesmo princípio de lib/rules/engine.ts. A UI
 * (components/pipeline/) só consome o resultado destas funções.
 */
export const PIPELINE_STAGES: ReadonlyArray<{ key: PipelineStage; label: string }> = [
  { key: "new_lead", label: "Novo lead" },
  { key: "first_contact_done", label: "Primeiro contato realizado" },
  { key: "motivation_identified", label: "Motivação identificada" },
  { key: "case_sent", label: "Caso/prova enviado" },
  { key: "evaluation_offered", label: "Avaliação oferecida" },
  { key: "evaluation_scheduled", label: "Avaliação agendada" },
  { key: "payment_pending", label: "Pagamento pendente" },
  { key: "confirmed", label: "Confirmada" },
  { key: "attended", label: "Compareceu" },
  { key: "plan_presented", label: "Plano apresentado" },
  { key: "objection_tracking", label: "Objeção em acompanhamento" },
  { key: "plan_accepted", label: "Plano aceito" },
  { key: "execution_in_phases", label: "Execução em fases" },
  { key: "post_procedure", label: "Pós-procedimento" },
  { key: "return_visit", label: "Retorno" },
  { key: "active_recurrence", label: "Recorrência ativa" },
  { key: "reactivation", label: "Reativação" },
  { key: "lost", label: "Perdida / sem continuidade" },
];

export type DueUrgency = "atrasado" | "hoje" | "amanha" | "esta_semana" | "futuro";

/**
 * Destaques HOJE/ATRASADO/AMANHÃ/ESTA SEMANA — docs/CRM_MASTER_SPEC.md §6.
 * Usa o dia calendário em UTC para os dois lados da comparação — nunca o
 * fuso local do processo (o deploy roda serverless, fuso não é garantido) —
 * assim o resultado é determinístico independente de onde o código roda.
 */
export function classifyDueDate(dueAt: string | null, now: Date): DueUrgency | null {
  if (!dueAt) return null;

  const startOfUtcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const diffDays = Math.round(
    (startOfUtcDay(new Date(dueAt)) - startOfUtcDay(now)) / 86_400_000
  );

  if (diffDays < 0) return "atrasado";
  if (diffDays === 0) return "hoje";
  if (diffDays === 1) return "amanha";
  if (diffDays <= 7) return "esta_semana";
  return "futuro";
}

export interface PipelineCard {
  patientId: string;
  fullName: string;
  stage: PipelineStage;
  nextAction: string | null;
  nextActionDueAt: string | null;
  dueUrgency: DueUrgency | null;
  missingNextAction: boolean;
}

export type PipelineBoard = Record<PipelineStage, PipelineCard[]>;

function emptyBoard(): PipelineBoard {
  return Object.fromEntries(PIPELINE_STAGES.map((s) => [s.key, []])) as unknown as PipelineBoard;
}

const URGENCY_WEIGHT: Record<DueUrgency, number> = {
  atrasado: 4,
  hoje: 3,
  amanha: 2,
  esta_semana: 1,
  futuro: 0,
};

/**
 * Agrupa pacientes por estágio. Paciente sem jornada (`patient_journeys`
 * ainda não criado) não aparece no board — isso é uma violação de regra de
 * ouro tratada separadamente (ver lib/rules/golden-rule.ts), não um card
 * "fantasma" num estágio inventado.
 */
export function buildPipelineBoard(
  patients: Patient[],
  journeys: PatientJourney[],
  now: Date = new Date()
): PipelineBoard {
  const journeyByPatientId = new Map(journeys.map((j) => [j.patientId, j]));
  const board = emptyBoard();

  for (const patient of patients) {
    const journey = journeyByPatientId.get(patient.id);
    if (!journey) continue;

    const dueUrgency = classifyDueDate(journey.nextActionDueAt, now);
    board[journey.stage].push({
      patientId: patient.id,
      fullName: patient.fullName,
      stage: journey.stage,
      nextAction: journey.nextAction,
      nextActionDueAt: journey.nextActionDueAt,
      dueUrgency,
      missingNextAction: !journey.nextAction || !journey.nextActionDueAt,
    });
  }

  for (const cards of Object.values(board)) {
    cards.sort((a, b) => {
      if (a.missingNextAction !== b.missingNextAction) return a.missingNextAction ? -1 : 1;
      const aw = a.dueUrgency ? URGENCY_WEIGHT[a.dueUrgency] : -1;
      const bw = b.dueUrgency ? URGENCY_WEIGHT[b.dueUrgency] : -1;
      return bw - aw;
    });
  }

  return board;
}

/** Indicador de dashboard "PACIENTES SEM PRÓXIMA AÇÃO" (docs/CRM_RULES.md #1) — meta é zero. */
export function countMissingNextAction(board: PipelineBoard): number {
  return Object.values(board).reduce(
    (sum, cards) => sum + cards.filter((c) => c.missingNextAction).length,
    0
  );
}

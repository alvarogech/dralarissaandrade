import { PIPELINE_STAGES } from "./board";
import type { Appointment, Patient, PatientJourney, PipelineStage, Receivable } from "@/lib/rules/types";

/**
 * Modo FUP (docs/CRM_MASTER_SPEC.md §12, prompt mestre §90): fila plana e
 * ordenada de pacientes em violação da regra de ouro (sem next_action ou sem
 * data), para resolver uma de cada vez em vez de vasculhar o board. Puro —
 * mesmo princípio de lib/pipeline/board.ts.
 *
 * Contexto por item vem só do que já temos de verdade (agenda, recebíveis) —
 * nunca resumo de conversa/motivação fabricado (WhatsApp real ainda não
 * existe, ver docs/WHATSAPP_ARCHITECTURE.md).
 */
export interface FupQueueItem {
  patientId: string;
  fullName: string;
  phone: string | null;
  stage: PipelineStage;
  stageLabel: string;
  hasOpenReceivable: boolean;
  hasUpcomingAppointment: boolean;
}

const STAGE_ORDER = new Map(PIPELINE_STAGES.map((s, i) => [s.key, i]));
const STAGE_LABEL = new Map(PIPELINE_STAGES.map((s) => [s.key, s.label]));

export function buildFupQueue(
  patients: Patient[],
  journeys: PatientJourney[],
  receivables: Receivable[],
  appointments: Appointment[]
): FupQueueItem[] {
  const journeyByPatientId = new Map(journeys.map((j) => [j.patientId, j]));
  const openReceivablePatientIds = new Set(
    receivables.filter((r) => !r.paidAt).map((r) => r.patientId)
  );
  const upcomingAppointmentPatientIds = new Set(
    appointments
      .filter((a) => a.status === "scheduled" || a.status === "confirmed")
      .map((a) => a.patientId)
  );

  const queue: FupQueueItem[] = [];

  for (const patient of patients) {
    const journey = journeyByPatientId.get(patient.id);
    if (!journey || journey.stage === "lost") continue;

    const missingNextAction = !journey.nextAction || !journey.nextActionDueAt;
    if (!missingNextAction) continue;

    queue.push({
      patientId: patient.id,
      fullName: patient.fullName,
      phone: patient.phone ?? null,
      stage: journey.stage,
      stageLabel: STAGE_LABEL.get(journey.stage) ?? journey.stage,
      hasOpenReceivable: openReceivablePatientIds.has(patient.id),
      hasUpcomingAppointment: upcomingAppointmentPatientIds.has(patient.id),
    });
  }

  queue.sort((a, b) => (STAGE_ORDER.get(a.stage) ?? 0) - (STAGE_ORDER.get(b.stage) ?? 0));

  return queue;
}

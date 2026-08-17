export type AlertPriority = "critical" | "important" | "opportunity" | "informative";

// Ver docs/DATABASE_SCHEMA.md — enum `crm_pipeline_stage` (18 estagios, migration 0009).
// Substitui o antigo PipelineStage de 13 valores (mapeamento documentado na migration).
export type PipelineStage =
  | "new_lead"
  | "first_contact_done"
  | "motivation_identified"
  | "case_sent"
  | "evaluation_offered"
  | "evaluation_scheduled"
  | "payment_pending"
  | "confirmed"
  | "attended"
  | "plan_presented"
  | "objection_tracking"
  | "plan_accepted"
  | "execution_in_phases"
  | "post_procedure"
  | "return_visit"
  | "active_recurrence"
  | "reactivation"
  | "lost";

/** Estagios em que a paciente e considerada "encerrada" — regra de ouro nao se aplica. */
export const CLOSED_STAGES: readonly PipelineStage[] = ["lost"];

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show"
  | "rescheduled";

export interface Patient {
  id: string;
  fullName: string;
  requiresContinuation: boolean;
}

export interface PatientJourney {
  patientId: string;
  stage: PipelineStage;
  nextAction: string | null;
  nextActionDueAt: string | null;
}

export interface Appointment {
  id: string;
  patientId: string;
  professionalName: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  reason: string;
  requiresPayment: boolean;
  completedAt?: string;
}

export interface Payment {
  id: string;
  appointmentId: string;
  patientId: string;
  amount: number;
  confirmedAt: string | null;
}

export interface Receivable {
  id: string;
  patientId: string;
  amount: number;
  dueAt: string;
  paidAt: string | null;
}

export interface TreatmentPlan {
  id: string;
  patientId: string;
  status: "presented" | "negotiation" | "accepted" | "partially_accepted" | "rejected";
  presentedAt: string;
  respondedAt: string | null;
  hasProcedureScheduled: boolean;
  value: number;
}

/** Estado agregado que o RuleEngine avalia — construido a partir do banco (ou do seed em modo demo). */
export interface ClinicSnapshot {
  now: string;
  patients: Patient[];
  journeys: PatientJourney[];
  appointments: Appointment[];
  payments: Payment[];
  receivables: Receivable[];
  treatmentPlans: TreatmentPlan[];
}

export interface GeneratedAlert {
  id: string;
  ruleId: string;
  category: string;
  priority: AlertPriority;
  patientId: string | null;
  patientName: string | null;
  title: string;
  recommendedAction: string;
  assignedToRole: "gestor" | "recepcao" | "clinica" | "financeiro";
  financialImpact: number | null;
  dueAt: string | null;
}

export interface GeneratedOpportunity {
  id: string;
  ruleId: string;
  type: string;
  patientId: string;
  patientName: string;
  title: string;
  estimatedValue: number | null;
  urgency: "alta" | "media" | "baixa";
}

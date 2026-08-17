import type { AppointmentStatus } from "@/lib/rules/types";

/**
 * Forma normalizada de um compromisso lido do Simples Dental (ou de
 * qualquer fonte futura), antes de tocar o banco. A extracao em si (ler a
 * tela via accessibility tree) e feita por automacao de navegador — nao ha
 * como isso ser codigo puro. O que É codigo puro/testavel e tudo que vem
 * depois: normalizar, casar paciente, decidir criar/atualizar/ignorar.
 * Ver docs/INTEGRATIONS.md.
 */
export interface NormalizedAppointment {
  source: "simples_dental_browser";
  /** Identificador estavel na fonte, quando disponivel (ex.: id do compromisso na URL/DOM). */
  sdAppointmentId?: string;
  patient: {
    /** Identificador estavel do paciente na fonte (preferido para matching). */
    sdPatientId?: string;
    fullName: string;
    phone?: string;
  };
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  reason: string;
  requiresPayment: boolean;
}

export interface PatientCandidate {
  id: string;
  fullName: string;
  phone: string | null;
}

export type PatientMatchDecision =
  | { action: "use_existing"; patientId: string }
  | { action: "create" }
  | { action: "requires_review"; reason: string; candidateIds: string[] };

export interface SyncItemResult {
  input: NormalizedAppointment;
  patientAction: PatientMatchDecision["action"];
  appointmentAction: "created" | "updated" | "unchanged" | "requires_review";
  patientId?: string;
  appointmentId?: string;
}

export interface SyncRunSummary {
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  requiresReview: number;
  results: SyncItemResult[];
}

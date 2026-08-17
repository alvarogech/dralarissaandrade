import { CLOSED_STAGES, type Patient, type PatientJourney } from "./types";

/**
 * Regra de ouro (docs/CRM_RULES.md #1): toda paciente ativa precisa ter, ao
 * mesmo tempo, estagio + responsavel + proxima acao + data da proxima acao.
 * Puro e determinístico — nenhuma chamada de IA, nenhum acesso a banco (ver
 * docs/ARCHITECTURE.md "determinístico vs. IA").
 */

export type GoldenRuleMissingField = "journey" | "responsible" | "next_action" | "next_action_due_at";

export interface GoldenRuleViolation {
  patientId: string;
  patientName: string;
  missing: GoldenRuleMissingField[];
}

/**
 * @param hasResponsible true se existir uma task aberta atribuida para esta
 *   paciente OU `journey.updatedBy` estiver preenchido (ver DATABASE_SCHEMA.md).
 */
export function checkGoldenRule(
  patient: Patient,
  journey: PatientJourney | undefined,
  hasResponsible: boolean
): GoldenRuleViolation | null {
  if (!journey) {
    return { patientId: patient.id, patientName: patient.fullName, missing: ["journey"] };
  }

  if (CLOSED_STAGES.includes(journey.stage)) return null;

  const missing: GoldenRuleMissingField[] = [];
  if (!hasResponsible) missing.push("responsible");
  if (!journey.nextAction) missing.push("next_action");
  if (!journey.nextActionDueAt) missing.push("next_action_due_at");

  if (missing.length === 0) return null;
  return { patientId: patient.id, patientName: patient.fullName, missing };
}

/** Roda a regra de ouro sobre todas as pacientes de um snapshot. */
export function checkGoldenRuleForAll(
  patients: Patient[],
  journeys: PatientJourney[],
  responsibleByPatientId: Set<string>
): GoldenRuleViolation[] {
  const journeyByPatientId = new Map(journeys.map((j) => [j.patientId, j]));
  const violations: GoldenRuleViolation[] = [];

  for (const patient of patients) {
    const violation = checkGoldenRule(
      patient,
      journeyByPatientId.get(patient.id),
      responsibleByPatientId.has(patient.id)
    );
    if (violation) violations.push(violation);
  }

  return violations;
}

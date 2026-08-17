import { describe, expect, it } from "vitest";
import { checkGoldenRule, checkGoldenRuleForAll } from "./golden-rule";
import type { Patient, PatientJourney } from "./types";

const patient: Patient = { id: "p1", fullName: "Mariana Silva", requiresContinuation: true };

describe("checkGoldenRule", () => {
  it("viola quando a paciente nunca teve uma jornada criada", () => {
    const violation = checkGoldenRule(patient, undefined, true);
    expect(violation?.missing).toEqual(["journey"]);
  });

  it("viola quando falta responsavel, proxima acao e data, mesmo com estagio definido", () => {
    const journey: PatientJourney = {
      patientId: "p1",
      stage: "active_recurrence",
      nextAction: null,
      nextActionDueAt: null,
    };
    const violation = checkGoldenRule(patient, journey, false);
    expect(violation?.missing).toEqual(["responsible", "next_action", "next_action_due_at"]);
  });

  it("nao viola quando os quatro campos estao presentes", () => {
    const journey: PatientJourney = {
      patientId: "p1",
      stage: "return_visit",
      nextAction: "Ligar para confirmar retorno",
      nextActionDueAt: "2026-09-01T00:00:00.000Z",
    };
    expect(checkGoldenRule(patient, journey, true)).toBeNull();
  });

  it("paciente perdida (lost) nunca viola a regra de ouro, mesmo sem proxima acao", () => {
    const journey: PatientJourney = {
      patientId: "p1",
      stage: "lost",
      nextAction: null,
      nextActionDueAt: null,
    };
    expect(checkGoldenRule(patient, journey, false)).toBeNull();
  });
});

describe("checkGoldenRuleForAll", () => {
  it("retorna uma violacao por paciente em situacao irregular, ignorando as regulares", () => {
    const patients: Patient[] = [
      patient,
      { id: "p2", fullName: "Ana Paula", requiresContinuation: true },
    ];
    const journeys: PatientJourney[] = [
      { patientId: "p1", stage: "active_recurrence", nextAction: null, nextActionDueAt: null },
      {
        patientId: "p2",
        stage: "return_visit",
        nextAction: "Retorno",
        nextActionDueAt: "2026-09-01T00:00:00.000Z",
      },
    ];

    const violations = checkGoldenRuleForAll(patients, journeys, new Set(["p1", "p2"]));
    expect(violations).toHaveLength(1);
    expect(violations[0]?.patientId).toBe("p1");
  });
});

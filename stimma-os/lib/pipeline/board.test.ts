import { describe, expect, it } from "vitest";
import { buildPipelineBoard, classifyDueDate, countMissingNextAction, PIPELINE_STAGES } from "./board";
import type { Patient, PatientJourney } from "@/lib/rules/types";

const NOW = new Date("2026-08-18T12:00:00.000Z");

describe("classifyDueDate", () => {
  it("retorna null quando nao ha data", () => {
    expect(classifyDueDate(null, NOW)).toBeNull();
  });

  it("classifica atrasado, hoje, amanha, esta semana e futuro corretamente", () => {
    expect(classifyDueDate("2026-08-17T12:00:00.000Z", NOW)).toBe("atrasado");
    expect(classifyDueDate("2026-08-18T23:00:00.000Z", NOW)).toBe("hoje");
    expect(classifyDueDate("2026-08-19T00:00:00.000Z", NOW)).toBe("amanha");
    expect(classifyDueDate("2026-08-23T00:00:00.000Z", NOW)).toBe("esta_semana");
    expect(classifyDueDate("2026-09-01T00:00:00.000Z", NOW)).toBe("futuro");
  });
});

describe("buildPipelineBoard", () => {
  const patients: Patient[] = [
    { id: "p1", fullName: "Mariana Silva", requiresContinuation: true },
    { id: "p2", fullName: "Ana Paula", requiresContinuation: true },
    { id: "p3", fullName: "Sem jornada", requiresContinuation: true },
  ];

  it("agrupa cada paciente na coluna do seu estagio, ignorando quem nao tem jornada", () => {
    const journeys: PatientJourney[] = [
      { patientId: "p1", stage: "new_lead", nextAction: "Responder", nextActionDueAt: "2026-08-18T00:00:00.000Z" },
      { patientId: "p2", stage: "plan_presented", nextAction: null, nextActionDueAt: null },
    ];

    const board = buildPipelineBoard(patients, journeys, NOW);

    expect(board.new_lead.map((c) => c.patientId)).toEqual(["p1"]);
    expect(board.plan_presented.map((c) => c.patientId)).toEqual(["p2"]);
    expect(Object.values(board).flat().some((c) => c.patientId === "p3")).toBe(false);
  });

  it("marca missingNextAction quando falta acao ou data, e ordena esses primeiro", () => {
    const journeys: PatientJourney[] = [
      { patientId: "p1", stage: "new_lead", nextAction: "Responder", nextActionDueAt: "2026-08-25T00:00:00.000Z" },
      { patientId: "p2", stage: "new_lead", nextAction: null, nextActionDueAt: null },
    ];

    const board = buildPipelineBoard(patients, journeys, NOW);

    expect(board.new_lead[0]?.patientId).toBe("p2");
    expect(board.new_lead[0]?.missingNextAction).toBe(true);
    expect(board.new_lead[1]?.missingNextAction).toBe(false);
  });

  it("dentro dos que tem next_action, prioriza atrasado > hoje > amanha > esta semana > futuro", () => {
    const journeys: PatientJourney[] = [
      { patientId: "p1", stage: "new_lead", nextAction: "A", nextActionDueAt: "2026-09-01T00:00:00.000Z" },
      { patientId: "p2", stage: "new_lead", nextAction: "B", nextActionDueAt: "2026-08-17T00:00:00.000Z" },
    ];

    const board = buildPipelineBoard(patients, journeys, NOW);

    expect(board.new_lead.map((c) => c.patientId)).toEqual(["p2", "p1"]);
  });

  it("contem as 18 colunas do pipeline, mesmo vazias", () => {
    const board = buildPipelineBoard([], [], NOW);
    expect(Object.keys(board)).toHaveLength(18);
    expect(PIPELINE_STAGES).toHaveLength(18);
  });
});

describe("countMissingNextAction", () => {
  it("soma violacoes da regra de ouro em todas as colunas", () => {
    const patients: Patient[] = [
      { id: "p1", fullName: "A", requiresContinuation: true },
      { id: "p2", fullName: "B", requiresContinuation: true },
    ];
    const journeys: PatientJourney[] = [
      { patientId: "p1", stage: "new_lead", nextAction: null, nextActionDueAt: null },
      { patientId: "p2", stage: "active_recurrence", nextAction: null, nextActionDueAt: null },
    ];

    const board = buildPipelineBoard(patients, journeys, NOW);
    expect(countMissingNextAction(board)).toBe(2);
  });
});

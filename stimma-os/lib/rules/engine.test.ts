import { describe, expect, it } from "vitest";
import { runRuleEngine, sortAlertsByPriority, topPriorities } from "./engine";
import type { ClinicSnapshot } from "./types";

const NOW = "2026-08-17T18:00:00.000Z";

function baseSnapshot(overrides: Partial<ClinicSnapshot> = {}): ClinicSnapshot {
  return {
    now: NOW,
    patients: [],
    journeys: [],
    appointments: [],
    payments: [],
    receivables: [],
    treatmentPlans: [],
    ...overrides,
  };
}

describe("RuleEngine — pagamento não localizado", () => {
  it("gera alerta crítico quando atendimento concluído há mais de 1h não tem pagamento confirmado", () => {
    const snapshot = baseSnapshot({
      patients: [{ id: "p1", fullName: "Mariana Silva", requiresContinuation: true }],
      appointments: [
        {
          id: "a1",
          patientId: "p1",
          professionalName: "Dra. Larissa",
          startsAt: "2026-08-17T14:00:00.000Z",
          endsAt: "2026-08-17T15:00:00.000Z",
          status: "completed",
          reason: "Procedimento",
          requiresPayment: true,
          completedAt: "2026-08-17T15:00:00.000Z",
        },
      ],
    });

    const result = runRuleEngine(snapshot);
    expect(result.alerts.some((a) => a.ruleId === "financial_missing_payment")).toBe(true);
  });

  it("não gera alerta quando o pagamento já foi confirmado", () => {
    const snapshot = baseSnapshot({
      patients: [{ id: "p1", fullName: "Mariana Silva", requiresContinuation: true }],
      appointments: [
        {
          id: "a1",
          patientId: "p1",
          professionalName: "Dra. Larissa",
          startsAt: "2026-08-17T14:00:00.000Z",
          endsAt: "2026-08-17T15:00:00.000Z",
          status: "completed",
          reason: "Procedimento",
          requiresPayment: true,
          completedAt: "2026-08-17T15:00:00.000Z",
        },
      ],
      payments: [
        {
          id: "pay1",
          appointmentId: "a1",
          patientId: "p1",
          amount: 3500,
          confirmedAt: "2026-08-17T15:10:00.000Z",
        },
      ],
    });

    const result = runRuleEngine(snapshot);
    expect(result.alerts.some((a) => a.ruleId === "financial_missing_payment")).toBe(false);
  });
});

describe("RuleEngine — golden rule (próximo passo)", () => {
  it("alerta quando paciente que requer continuidade não tem next_action 12h+ após o atendimento", () => {
    const snapshot = baseSnapshot({
      patients: [{ id: "p2", fullName: "Ana Paula", requiresContinuation: true }],
      appointments: [
        {
          id: "a2",
          patientId: "p2",
          professionalName: "Dra. Larissa",
          startsAt: "2026-08-16T14:00:00.000Z",
          endsAt: "2026-08-16T15:00:00.000Z",
          status: "completed",
          reason: "Retorno",
          requiresPayment: false,
          completedAt: "2026-08-16T15:00:00.000Z",
        },
      ],
      journeys: [{ patientId: "p2", stage: "return_visit", nextAction: null, nextActionDueAt: null }],
    });

    const result = runRuleEngine(snapshot);
    expect(result.alerts.some((a) => a.ruleId === "no_next_step")).toBe(true);
  });

  it("não alerta quando next_action já está definido", () => {
    const snapshot = baseSnapshot({
      patients: [{ id: "p2", fullName: "Ana Paula", requiresContinuation: true }],
      appointments: [
        {
          id: "a2",
          patientId: "p2",
          professionalName: "Dra. Larissa",
          startsAt: "2026-08-16T14:00:00.000Z",
          endsAt: "2026-08-16T15:00:00.000Z",
          status: "completed",
          reason: "Retorno",
          requiresPayment: false,
          completedAt: "2026-08-16T15:00:00.000Z",
        },
      ],
      journeys: [
        {
          patientId: "p2",
          stage: "return_visit",
          nextAction: "Retorno em 30 dias",
          nextActionDueAt: "2026-09-16T00:00:00.000Z",
        },
      ],
    });

    const result = runRuleEngine(snapshot);
    expect(result.alerts.some((a) => a.ruleId === "no_next_step")).toBe(false);
  });
});

describe("RuleEngine — recebível vencido", () => {
  it("gera alerta com impacto financeiro igual ao valor do recebível", () => {
    const snapshot = baseSnapshot({
      patients: [{ id: "p3", fullName: "João Pedro", requiresContinuation: false }],
      receivables: [
        { id: "r1", patientId: "p3", amount: 1200, dueAt: "2026-08-10T00:00:00.000Z", paidAt: null },
      ],
    });

    const result = runRuleEngine(snapshot);
    const alert = result.alerts.find((a) => a.ruleId === "receivable_overdue");
    expect(alert?.financialImpact).toBe(1200);
  });
});

describe("RuleEngine — cancelamento", () => {
  it("gera oportunidade de recuperação do paciente e alerta de horário livre quando não houve reagendamento", () => {
    const snapshot = baseSnapshot({
      patients: [{ id: "p4", fullName: "Carla Souza", requiresContinuation: true }],
      appointments: [
        {
          id: "a4",
          patientId: "p4",
          professionalName: "Dra. Larissa",
          startsAt: "2026-08-15T16:00:00.000Z",
          endsAt: "2026-08-15T17:00:00.000Z",
          status: "cancelled",
          reason: "Retorno",
          requiresPayment: false,
        },
      ],
    });

    const result = runRuleEngine(snapshot);
    expect(result.opportunities.some((o) => o.ruleId === "cancellation_patient_recovery")).toBe(true);
    expect(result.alerts.some((a) => a.ruleId === "cancellation_schedule_gap")).toBe(true);
  });
});

describe("sortAlertsByPriority", () => {
  it("ordena críticos antes de importantes, e por impacto financeiro em caso de empate", () => {
    const sorted = sortAlertsByPriority([
      {
        id: "1",
        ruleId: "x",
        category: "financeiro",
        priority: "important",
        patientId: null,
        patientName: null,
        title: "B",
        recommendedAction: "",
        assignedToRole: "gestor",
        financialImpact: 100,
        dueAt: null,
      },
      {
        id: "2",
        ruleId: "x",
        category: "financeiro",
        priority: "critical",
        patientId: null,
        patientName: null,
        title: "A",
        recommendedAction: "",
        assignedToRole: "gestor",
        financialImpact: 50,
        dueAt: null,
      },
    ]);

    expect(sorted[0]?.title).toBe("A");
  });
});

describe("topPriorities", () => {
  it("nunca retorna mais que o limite pedido", () => {
    const result = runRuleEngine(
      baseSnapshot({
        patients: [{ id: "p5", fullName: "X", requiresContinuation: false }],
        receivables: [
          { id: "r1", patientId: "p5", amount: 100, dueAt: "2026-08-01T00:00:00.000Z", paidAt: null },
          { id: "r2", patientId: "p5", amount: 200, dueAt: "2026-08-02T00:00:00.000Z", paidAt: null },
          { id: "r3", patientId: "p5", amount: 300, dueAt: "2026-08-03T00:00:00.000Z", paidAt: null },
          { id: "r4", patientId: "p5", amount: 400, dueAt: "2026-08-04T00:00:00.000Z", paidAt: null },
        ],
      })
    );

    expect(topPriorities(result, 3)).toHaveLength(3);
  });
});

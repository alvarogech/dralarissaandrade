import { describe, expect, it } from "vitest";
import { summarizeFinancials } from "./financial-summary";
import type { ClinicSnapshot } from "./types";

const NOW = "2026-08-17T18:00:00.000Z";

function baseSnapshot(receivables: ClinicSnapshot["receivables"]): ClinicSnapshot {
  return {
    now: NOW,
    patients: [],
    journeys: [],
    appointments: [],
    payments: [],
    receivables,
    treatmentPlans: [],
  };
}

describe("summarizeFinancials", () => {
  it("separa vencido, em aberto e recebido sem misturar num total só", () => {
    const summary = summarizeFinancials(
      baseSnapshot([
        { id: "r1", patientId: "p1", amount: 500, dueAt: "2026-08-10T00:00:00.000Z", paidAt: null }, // vencido
        { id: "r2", patientId: "p2", amount: 300, dueAt: "2026-09-01T00:00:00.000Z", paidAt: null }, // em aberto
        { id: "r3", patientId: "p3", amount: 1200, dueAt: "2026-08-01T00:00:00.000Z", paidAt: "2026-08-02T00:00:00.000Z" }, // recebido
      ])
    );

    expect(summary.overdueCount).toBe(1);
    expect(summary.overdueTotal).toBe(500);
    expect(summary.pendingCount).toBe(1);
    expect(summary.pendingTotal).toBe(300);
    expect(summary.receivedCount).toBe(1);
    expect(summary.receivedTotal).toBe(1200);
    expect(summary.overdueReceivables).toHaveLength(1);
  });

  it("retorna tudo zerado quando não há recebíveis", () => {
    const summary = summarizeFinancials(baseSnapshot([]));
    expect(summary.overdueTotal).toBe(0);
    expect(summary.receivedTotal).toBe(0);
    expect(summary.pendingTotal).toBe(0);
  });

  it("um recebível pago não conta como vencido mesmo se a data já passou", () => {
    const summary = summarizeFinancials(
      baseSnapshot([{ id: "r1", patientId: "p1", amount: 500, dueAt: "2026-08-01T00:00:00.000Z", paidAt: "2026-08-05T00:00:00.000Z" }])
    );
    expect(summary.overdueCount).toBe(0);
    expect(summary.receivedCount).toBe(1);
  });
});

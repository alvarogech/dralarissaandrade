import { describe, expect, it } from "vitest";
import { agruparRecebiveisVencidos } from "./engine";
import type { GeneratedAlert } from "./types";

const alerta = (id: string, valor: number, extra: Partial<GeneratedAlert> = {}): GeneratedAlert => ({
  id, ruleId: "receivable_overdue", category: "financeiro", priority: "critical", patientId: id, patientName: `Paciente ${id}`,
  title: "x", recommendedAction: "y", assignedToRole: "financeiro", financialImpact: valor, dueAt: "2026-10-10T12:00:00Z", ...extra,
});

describe("agruparRecebiveisVencidos", () => {
  it("vários vencidos viram um item com total e o maior em destaque; demais alertas intactos", () => {
    const outro = alerta("z", 0, { ruleId: "no_next_step", id: "outro" });
    const r = agruparRecebiveisVencidos([alerta("a", 100), alerta("b", 450), outro]);
    expect(r).toHaveLength(2);
    const ag = r.find((a) => a.id === "receivable-overdue-agregado")!;
    expect(ag.title).toMatch(/2 recebíveis vencidos — R\$\s?550,00/);
    expect(ag.recommendedAction).toContain("Paciente b");
    expect(r).toContain(outro);
  });

  it("um só vencido continua individual", () => {
    expect(agruparRecebiveisVencidos([alerta("a", 100)])[0]!.id).toBe("a");
  });
});

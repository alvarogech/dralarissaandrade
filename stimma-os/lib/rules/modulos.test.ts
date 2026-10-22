import { describe, expect, it } from "vitest";
import { runRuleEngine, topPriorities } from "./engine";
import { semFinanceiroSuspenso } from "./modulos";
import { buildDemoSnapshot } from "@/lib/seed/seed-data";

describe("módulo financeiro suspenso", () => {
  it("nenhum alerta ou prioridade financeira sai do motor de regras para a interface", () => {
    const result = runRuleEngine(buildDemoSnapshot());
    expect(result.alerts.some((a) => a.category === "financeiro")).toBe(true); // o motor ainda calcula…
    const alerts = semFinanceiroSuspenso(result.alerts);
    expect(alerts.some((a) => a.category === "financeiro")).toBe(false); // …mas nada chega à tela
    const prioridades = topPriorities({ ...result, alerts }, 10);
    expect(prioridades.some((p) => /receb|pagamento|R\$/i.test(`${p.title} ${p.action}`))).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { decideAnamneseStage, nextBusinessDay } from "./anamnese-stage";

describe("decideAnamneseStage", () => {
  it("com data de avaliacao agendada, vai direto para evaluation_scheduled", () => {
    const decision = decideAnamneseStage("2026-09-01");
    expect(decision.stage).toBe("evaluation_scheduled");
    expect(decision.nextAction).toMatch(/confirmar/i);
  });

  it("sem data, entra como new_lead", () => {
    const decision = decideAnamneseStage(null);
    expect(decision.stage).toBe("new_lead");
    expect(decision.nextAction).toMatch(/revisar/i);
  });
});

describe("nextBusinessDay", () => {
  it("dia comum vira o dia seguinte", () => {
    // 2026-08-18 e terca-feira
    const result = nextBusinessDay(new Date("2026-08-18T10:00:00.000Z"));
    expect(result.getDay()).toBe(3); // quarta
  });

  it("sexta-feira pula pra segunda", () => {
    // 2026-08-21 e sexta-feira
    const result = nextBusinessDay(new Date("2026-08-21T10:00:00.000Z"));
    expect(result.getDay()).toBe(1); // segunda
  });

  it("sabado pula pra segunda", () => {
    // 2026-08-22 e sabado
    const result = nextBusinessDay(new Date("2026-08-22T10:00:00.000Z"));
    expect(result.getDay()).toBe(1);
  });
});

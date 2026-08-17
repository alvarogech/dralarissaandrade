import { describe, expect, it } from "vitest";
import { decidePatientMatch } from "./patient-matching";
import type { PatientCandidate } from "./types";

describe("decidePatientMatch", () => {
  it("usa o paciente existente quando o telefone bate com exatamente um candidato", () => {
    const candidates: PatientCandidate[] = [
      { id: "p1", fullName: "Ana Paula", phone: "62999998888" },
      { id: "p2", fullName: "Outra Pessoa", phone: "62911112222" },
    ];
    const decision = decidePatientMatch({ phone: "(62) 99999-8888", fullName: "Ana Paula" }, candidates);
    expect(decision).toEqual({ action: "use_existing", patientId: "p1" });
  });

  it("pede revisão quando dois pacientes têm o mesmo telefone", () => {
    const candidates: PatientCandidate[] = [
      { id: "p1", fullName: "Ana Paula", phone: "62999998888" },
      { id: "p2", fullName: "Ana Paula Silva", phone: "62999998888" },
    ];
    const decision = decidePatientMatch({ phone: "62999998888", fullName: "Ana Paula" }, candidates);
    expect(decision.action).toBe("requires_review");
  });

  it("cria um paciente novo quando não há telefone e nenhum nome bate", () => {
    const candidates: PatientCandidate[] = [{ id: "p1", fullName: "Outra Pessoa", phone: null }];
    const decision = decidePatientMatch({ fullName: "Fernanda Lima" }, candidates);
    expect(decision).toEqual({ action: "create" });
  });

  it("nunca vincula automaticamente só por nome — pede revisão mesmo com match único", () => {
    const candidates: PatientCandidate[] = [{ id: "p1", fullName: "Fernanda Lima", phone: null }];
    const decision = decidePatientMatch({ fullName: "Fernanda Lima" }, candidates);
    expect(decision.action).toBe("requires_review");
  });

  it("cai para nome quando o telefone informado não bate com ninguém", () => {
    const candidates: PatientCandidate[] = [{ id: "p1", fullName: "Fernanda Lima", phone: "62911112222" }];
    const decision = decidePatientMatch({ phone: "62900000000", fullName: "Fernanda Lima" }, candidates);
    expect(decision.action).toBe("requires_review");
  });
});

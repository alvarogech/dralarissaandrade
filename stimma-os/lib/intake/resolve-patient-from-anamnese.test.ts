import { describe, expect, it } from "vitest";
import { resolvePatientFromAnamnese } from "./resolve-patient-from-anamnese";
import { createFakeSupabase } from "@/lib/sync/test-fake-supabase";

const ORG_ID = "org-1";

function baseInput(overrides: Partial<Parameters<typeof resolvePatientFromAnamnese>[2]> = {}) {
  return {
    anamneseId: "anamnese-1",
    type: "hof" as const,
    fullName: "Maria Silva",
    phone: "+5562999990000",
    birthDate: "1990-01-01",
    email: "maria@example.com",
    appointmentDate: null,
    origem: "instagram",
    origemOutro: null,
    ...overrides,
  };
}

describe("resolvePatientFromAnamnese", () => {
  it("cria paciente nova como new_lead quando nao ha data de avaliacao, com lead_source e tag", async () => {
    const fake = createFakeSupabase();

    const result = await resolvePatientFromAnamnese(fake as any, ORG_ID, baseInput());

    expect(result.action).toBe("created");

    const patients = fake._tables.get("patients");
    expect(patients).toHaveLength(1);
    expect(patients?.[0]).toMatchObject({
      full_name: "Maria Silva",
      phone: "+5562999990000",
      email: "maria@example.com",
      campaign: "instagram",
    });

    const leadSources = fake._tables.get("lead_sources");
    expect(leadSources).toHaveLength(1);
    expect(leadSources?.[0]).toMatchObject({ key: "anamnese" });

    const tags = fake._tables.get("tags");
    expect(tags?.[0]).toMatchObject({ label: "HOF" });
    expect(fake._tables.get("patient_tags")).toHaveLength(1);

    const journeys = fake._tables.get("patient_journeys");
    expect(journeys?.[0]).toMatchObject({
      stage: "new_lead",
      next_action: "Revisar anamnese e entrar em contato",
    });
  });

  it("entra como evaluation_scheduled quando ha data de avaliacao no formulario", async () => {
    const fake = createFakeSupabase();

    await resolvePatientFromAnamnese(fake as any, ORG_ID, baseInput({ appointmentDate: "2026-09-01" }));

    const journeys = fake._tables.get("patient_journeys");
    expect(journeys?.[0]).toMatchObject({ stage: "evaluation_scheduled" });
  });

  it("paciente ja existente (mesmo telefone) nao tem estagio alterado -- so cria tarefa", async () => {
    const fake = createFakeSupabase();
    fake._tables.set("patients", [
      { id: "p-existing", organization_id: ORG_ID, full_name: "Maria Silva", phone: "+5562999990000" },
    ]);
    fake._tables.set("patient_journeys", [
      { patient_id: "p-existing", stage: "active_recurrence", next_action: "Ligar em 30 dias", next_action_due_at: "2026-09-01T00:00:00.000Z" },
    ]);

    const result = await resolvePatientFromAnamnese(fake as any, ORG_ID, baseInput());

    expect(result).toEqual({ action: "existing_task_created", patientId: "p-existing" });
    expect(fake._tables.get("patients")).toHaveLength(1); // nao duplicou
    expect(fake._tables.get("patient_journeys")?.[0]).toMatchObject({ stage: "active_recurrence" }); // intocado

    const tasks = fake._tables.get("tasks");
    expect(tasks).toHaveLength(1);
    expect(tasks?.[0]).toMatchObject({ patient_id: "p-existing", source: "anamnese_intake" });
  });

  it("nome batendo sem telefone confirmando vira requires_review, nunca vincula sozinho", async () => {
    const fake = createFakeSupabase();
    fake._tables.set("patients", [
      { id: "p-namesake", organization_id: ORG_ID, full_name: "Maria Silva", phone: "+5562911112222" },
    ]);

    const result = await resolvePatientFromAnamnese(
      fake as any,
      ORG_ID,
      baseInput({ phone: "+5562999999999" })
    );

    expect(result.action).toBe("requires_review");
    expect(fake._tables.get("patients")).toHaveLength(1);
  });

  it("usa origemOutro quando origem = 'outro'", async () => {
    const fake = createFakeSupabase();

    await resolvePatientFromAnamnese(
      fake as any,
      ORG_ID,
      baseInput({ origem: "outro", origemOutro: "Indicação de amiga no trabalho" })
    );

    const patients = fake._tables.get("patients");
    expect(patients?.[0]).toMatchObject({ campaign: "Indicação de amiga no trabalho" });
  });
});

import { describe, expect, it } from "vitest";
import { changeStage } from "./change-stage";
import { createFakeSupabase } from "@/lib/sync/test-fake-supabase";

describe("changeStage", () => {
  it("cria a jornada e grava o primeiro estagio no historico quando a paciente ainda nao tem jornada", async () => {
    const fake = createFakeSupabase();

    const { fromStage } = await changeStage(fake as any, {
      patientId: "p1",
      toStage: "new_lead",
      reason: "Lead recebido pelo WhatsApp",
      nextAction: "Responder",
      nextActionDueAt: "2026-08-18T00:00:00.000Z",
      changedBy: "gabi-id",
    });

    expect(fromStage).toBeNull();
    expect(fake._tables.get("pipeline_history")).toHaveLength(1);
    expect(fake._tables.get("pipeline_history")?.[0]).toMatchObject({
      patient_id: "p1",
      from_stage: null,
      to_stage: "new_lead",
      reason: "Lead recebido pelo WhatsApp",
    });
    expect(fake._tables.get("patient_journeys")).toHaveLength(1);
    expect(fake._tables.get("patient_journeys")?.[0]).toMatchObject({
      patient_id: "p1",
      stage: "new_lead",
      next_action: "Responder",
    });
  });

  it("atualiza a jornada existente e acumula uma nova linha no historico (nunca sobrescreve)", async () => {
    const fake = createFakeSupabase();

    await changeStage(fake as any, { patientId: "p1", toStage: "new_lead" });
    await changeStage(fake as any, {
      patientId: "p1",
      toStage: "first_contact_done",
      reason: "Gabi respondeu",
      nextAction: "Identificar motivacao",
      nextActionDueAt: "2026-08-19T00:00:00.000Z",
    });

    const history = fake._tables.get("pipeline_history");
    expect(history).toHaveLength(2);
    expect(history?.[1]).toMatchObject({ from_stage: "new_lead", to_stage: "first_contact_done" });

    const journeys = fake._tables.get("patient_journeys");
    expect(journeys).toHaveLength(1);
    expect(journeys?.[0]).toMatchObject({ stage: "first_contact_done", next_action: "Identificar motivacao" });
  });
});

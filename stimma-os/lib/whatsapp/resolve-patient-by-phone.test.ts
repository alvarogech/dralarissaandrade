import { describe, expect, it } from "vitest";
import { resolvePatientByPhone } from "./resolve-patient-by-phone";
import { createFakeSupabase } from "@/lib/sync/test-fake-supabase";

const ORG_ID = "org-1";

describe("resolvePatientByPhone", () => {
  it("cria paciente nova, com estagio new_lead e historico, quando o telefone e desconhecido", async () => {
    const fake = createFakeSupabase();

    const result = await resolvePatientByPhone(fake as any, ORG_ID, "+5562999990000");

    expect(result.action).toBe("created");
    const patients = fake._tables.get("patients");
    expect(patients).toHaveLength(1);
    expect(patients?.[0]).toMatchObject({ phone: "+5562999990000", organization_id: ORG_ID });

    const journeys = fake._tables.get("patient_journeys");
    expect(journeys?.[0]).toMatchObject({ stage: "new_lead" });

    const history = fake._tables.get("pipeline_history");
    expect(history?.[0]).toMatchObject({ to_stage: "new_lead", from_stage: null });
  });

  it("reaproveita paciente existente com o mesmo telefone, sem criar duplicata", async () => {
    const fake = createFakeSupabase();
    fake._tables.set("patients", [
      { id: "p-existing", organization_id: ORG_ID, full_name: "Maria Silva", phone: "+5562999990000" },
    ]);

    const result = await resolvePatientByPhone(fake as any, ORG_ID, "+5562999990000");

    expect(result).toEqual({ action: "use_existing", patientId: "p-existing" });
    expect(fake._tables.get("patients")).toHaveLength(1);
  });
});

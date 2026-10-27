import { describe, expect, it } from "vitest";
import { runAgendaSync } from "./run-sync";
import { createFakeSupabase } from "./test-fake-supabase";
import type { NormalizedAppointment } from "./types";

const ORG_ID = "org-1";

function makeItem(overrides: Partial<NormalizedAppointment> = {}): NormalizedAppointment {
  return {
    source: "simples_dental_browser",
    sdAppointmentId: "sd-appt-1",
    patient: { sdPatientId: "sd-patient-1", fullName: "Fernanda Lima", phone: "62999998888" },
    startsAt: "2026-08-17T18:00:00.000Z",
    endsAt: "2026-08-17T19:00:00.000Z",
    status: "confirmed",
    reason: "retorno",
    requiresPayment: false,
    ...overrides,
  };
}

describe("runAgendaSync", () => {
  it("cria paciente e compromisso novos na primeira execução", async () => {
    const supabase = createFakeSupabase();
    const summary = await runAgendaSync(supabase as any, ORG_ID, [makeItem()]);

    expect(summary.created).toBe(1);
    expect(summary.updated).toBe(0);
    expect(summary.requiresReview).toBe(0);
    expect(supabase._tables.get("patients")).toHaveLength(1);
    expect(supabase._tables.get("appointments")).toHaveLength(1);
  });

  it("é idempotente: rodar de novo com o mesmo conteúdo não duplica nem gera evento", async () => {
    const supabase = createFakeSupabase();
    await runAgendaSync(supabase as any, ORG_ID, [makeItem()]);
    const secondRun = await runAgendaSync(supabase as any, ORG_ID, [makeItem()]);

    expect(secondRun.unchanged).toBe(1);
    expect(secondRun.created).toBe(0);
    expect(supabase._tables.get("patients")).toHaveLength(1);
    expect(supabase._tables.get("appointments")).toHaveLength(1);
  });

  it("atualiza quando o conteúdo muda (ex.: status virou completed) em vez de criar de novo", async () => {
    const supabase = createFakeSupabase();
    await runAgendaSync(supabase as any, ORG_ID, [makeItem()]);
    const secondRun = await runAgendaSync(supabase as any, ORG_ID, [makeItem({ status: "completed" })]);

    expect(secondRun.updated).toBe(1);
    expect(supabase._tables.get("appointments")).toHaveLength(1);
    expect(supabase._tables.get("appointments")![0]!.status).toBe("completed");
  });

  it("pede revisão em vez de vincular quando só o nome bate com um paciente existente", async () => {
    const supabase = createFakeSupabase();
    // primeiro paciente sem external_id/telefone associado
    await runAgendaSync(supabase as any, ORG_ID, [
      makeItem({ sdAppointmentId: "sd-appt-1", patient: { fullName: "Carla Souza" } }),
    ]);

    // segundo pull: mesmo nome, sem sd_patient_id/telefone para confirmar
    const secondRun = await runAgendaSync(supabase as any, ORG_ID, [
      makeItem({ sdAppointmentId: "sd-appt-2", patient: { fullName: "Carla Souza" } }),
    ]);

    expect(secondRun.requiresReview).toBe(1);
    expect(supabase._tables.get("patients")).toHaveLength(1); // não duplicou o paciente
    // O compromisso aparece na agenda, mas SEM paciente vinculada e marcado para revisão (0017).
    const segundo = supabase._tables.get("appointments")!.find((a: any) => a.sd_appointment_id === "sd-appt-2")!;
    expect(segundo).toMatchObject({ patient_id: null, sd_patient_name: "Carla Souza", requires_review: true });
    expect(secondRun.results[0]).toMatchObject({ patientAction: "requires_review", appointmentAction: "requires_review", gravadoSemVinculo: true });
  });

  it("compromisso já gravado mantém o vínculo, mesmo que o nome agora bata com um cadastro (caso de 27/10)", async () => {
    const supabase = createFakeSupabase();
    const item = makeItem({ sdAppointmentId: "sd-appt-9", patient: { fullName: "Kleber Exemplo" } });
    await runAgendaSync(supabase as any, ORG_ID, [item]); // 1ª leitura: paciente nova, criada e vinculada
    const segunda = await runAgendaSync(supabase as any, ORG_ID, [item]);
    expect(segunda.results[0]).toMatchObject({ patientAction: "use_existing", appointmentAction: "unchanged" });
    expect(segunda.requiresReview).toBe(0);
    expect(supabase._tables.get("appointments")).toHaveLength(1);
  });

  it("nome + data de nascimento iguais a um cadastro existente: vincula; nome com nascimento diferente: não", async () => {
    const supabase = createFakeSupabase();
    supabase._tables.set("patients", [
      { id: "p-ana", organization_id: ORG_ID, full_name: "Ana Exemplo", phone: null, birth_date: "1990-05-10" },
    ]);
    const ok = await runAgendaSync(supabase as any, ORG_ID, [makeItem({ sdAppointmentId: "sd-a", patient: { fullName: "Ana Exemplo", birthDate: "1990-05-10" } })]);
    expect(ok.results[0]).toMatchObject({ patientAction: "use_existing", appointmentAction: "created", patientId: "p-ana" });
    const outra = await runAgendaSync(supabase as any, ORG_ID, [makeItem({ sdAppointmentId: "sd-b", patient: { fullName: "Ana Exemplo", birthDate: "1985-01-01" } })]);
    expect(outra.results[0]).toMatchObject({ patientAction: "requires_review" });
    expect(supabase._tables.get("appointments")!.find((a: any) => a.sd_appointment_id === "sd-b")).toMatchObject({ patient_id: null });
  });

  it("compromisso gravado sem vínculo passa a ser vinculado quando a data de nascimento confirma", async () => {
    const supabase = createFakeSupabase();
    supabase._tables.set("patients", [
      { id: "p-bia", organization_id: ORG_ID, full_name: "Bia Exemplo", phone: null, birth_date: "1992-02-02" },
    ]);
    await runAgendaSync(supabase as any, ORG_ID, [makeItem({ sdAppointmentId: "sd-c", patient: { fullName: "Bia Exemplo" } })]);
    expect(supabase._tables.get("appointments")![0]).toMatchObject({ patient_id: null, requires_review: true });
    await runAgendaSync(supabase as any, ORG_ID, [makeItem({ sdAppointmentId: "sd-c", patient: { fullName: "Bia Exemplo", birthDate: "1992-02-02" } })]);
    expect(supabase._tables.get("appointments")![0]).toMatchObject({ patient_id: "p-bia", requires_review: false });
    expect(supabase._tables.get("appointments")).toHaveLength(1);
  });

  it("marca requires_review no compromisso quando não há sd_appointment_id (sem como deduplicar depois)", async () => {
    const supabase = createFakeSupabase();
    await runAgendaSync(supabase as any, ORG_ID, [makeItem({ sdAppointmentId: undefined })]);

    const appt = supabase._tables.get("appointments")![0]!;
    expect(appt.requires_review).toBe(true);
  });

  it("registra automation_runs e audit_logs após o sync", async () => {
    const supabase = createFakeSupabase();
    await runAgendaSync(supabase as any, ORG_ID, [makeItem()]);

    expect(supabase._tables.get("automation_runs")).toHaveLength(1);
    expect(supabase._tables.get("audit_logs")).toHaveLength(1);
    expect(supabase._tables.get("audit_logs")![0]!.actor_type).toBe("claude");
  });
});

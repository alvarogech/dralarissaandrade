import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildDemoSnapshot } from "@/lib/seed/seed-data";
import type {
  Appointment,
  AppointmentStatus,
  ClinicSnapshot,
  Patient,
  PatientJourney,
  Receivable,
} from "@/lib/rules/types";

/**
 * Carrega o snapshot da clinica a partir do Supabase (respeitando RLS via
 * sessao do usuario). Cai para o snapshot de demonstracao apenas quando nao
 * ha nenhum paciente real cadastrado ainda (primeira execucao) ou quando o
 * Supabase nao esta configurado/acessivel — nunca mistura os dois.
 */
export async function getClinicSnapshot(): Promise<{
  snapshot: ClinicSnapshot;
  source: "supabase" | "demo";
}> {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { snapshot: buildDemoSnapshot(), source: "demo" };
  }

  const [{ data: patientsRows }, { data: journeysRows }, { data: appointmentsRows }, { data: receivablesRows }] =
    await Promise.all([
      supabase.from("patients").select("id, full_name, requires_continuation"),
      supabase.from("patient_journeys").select("patient_id, stage, next_action, next_action_due_at"),
      supabase
        .from("appointments")
        .select(
          "id, patient_id, professional_id, starts_at, ends_at, status, reason, requires_payment, completed_at, professionals ( full_name )"
        ),
      supabase.from("receivables").select("id, patient_id, amount, due_at, paid_at"),
    ]);

  if (!patientsRows || patientsRows.length === 0) {
    return { snapshot: buildDemoSnapshot(), source: "demo" };
  }

  const patients: Patient[] = patientsRows.map((p) => ({
    id: p.id,
    fullName: p.full_name,
    requiresContinuation: p.requires_continuation,
  }));

  const journeys: PatientJourney[] = (journeysRows ?? []).map((j) => ({
    patientId: j.patient_id,
    stage: j.stage,
    nextAction: j.next_action,
    nextActionDueAt: j.next_action_due_at,
  }));

  const appointments: Appointment[] = (appointmentsRows ?? []).map((a) => {
    const professional = Array.isArray(a.professionals) ? a.professionals[0] : a.professionals;
    return {
      id: a.id,
      patientId: a.patient_id,
      professionalName: professional?.full_name ?? "Equipe",
      startsAt: a.starts_at,
      endsAt: a.ends_at,
      status: a.status as AppointmentStatus,
      reason: a.reason ?? "",
      requiresPayment: a.requires_payment,
      completedAt: a.completed_at ?? undefined,
    };
  });

  const receivables: Receivable[] = (receivablesRows ?? []).map((r) => ({
    id: r.id,
    patientId: r.patient_id,
    amount: Number(r.amount),
    dueAt: r.due_at,
    paidAt: r.paid_at,
  }));

  const snapshot: ClinicSnapshot = {
    now: new Date().toISOString(),
    patients,
    journeys,
    appointments,
    payments: [],
    receivables,
    treatmentPlans: [],
  };

  return { snapshot, source: "supabase" };
}
